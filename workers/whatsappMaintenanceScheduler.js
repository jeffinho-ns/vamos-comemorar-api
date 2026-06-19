/**
 * Manutenção da Central WhatsApp:
 *  1) Expurgo de mídias de conversa após 24h (economia de espaço no Cloudinary).
 *     Atinge apenas mídias das pastas whatsapp-inbound / whatsapp-outbound.
 *     Flyers (pasta whatsapp-flyers) são preservados.
 *  2) Disparo de flyers "pós-visita" X horas após a reserva (pesquisa de
 *     satisfação), respeitando o delay configurado por flyer.
 */
const cloudinaryService = require('../services/cloudinaryService');
const { dispatchSingleFlyer } = require('../services/flyer/flyerService');

const MEDIA_CLEANUP_INTERVAL_MS = Number(
  process.env.WHATSAPP_MEDIA_CLEANUP_INTERVAL_MS || 60 * 60 * 1000
);
const FLYER_POSVISIT_INTERVAL_MS = Number(
  process.env.FLYER_POSVISIT_INTERVAL_MS || 15 * 60 * 1000
);
const MEDIA_TTL_HOURS = Number(process.env.WHATSAPP_MEDIA_TTL_HOURS || 24);

let cleanupTimer = null;
let flyerTimer = null;
let cleanupRunning = false;
let flyerRunning = false;

async function runMediaCleanup(pool) {
  if (cleanupRunning) return;
  cleanupRunning = true;
  try {
    const result = await pool.query(
      `SELECT id, media_public_id
         FROM whatsapp_messages
        WHERE media_url IS NOT NULL
          AND created_at < NOW() - ($1 || ' hours')::interval
          AND (media_url LIKE '%/whatsapp-inbound/%' OR media_url LIKE '%/whatsapp-outbound/%')
        LIMIT 300`,
      [String(MEDIA_TTL_HOURS)]
    );

    let purged = 0;
    for (const row of result.rows) {
      if (row.media_public_id) {
        try {
          await cloudinaryService.deleteFile(row.media_public_id);
        } catch (e) {
          console.warn('[whatsappMaintenance] falha ao apagar mídia Cloudinary:', e.message);
        }
      }
      await pool.query(
        `UPDATE whatsapp_messages
            SET media_url = NULL,
                media_public_id = NULL,
                body = COALESCE(NULLIF(body, ''), '📷 Imagem expirada (24h)')
          WHERE id = $1`,
        [row.id]
      );
      purged += 1;
    }

    if (purged > 0) {
      console.log(`[whatsappMaintenance] mídias expurgadas: ${purged}`);
    }
  } catch (error) {
    console.error('[whatsappMaintenance] erro no expurgo de mídia:', error.message);
  } finally {
    cleanupRunning = false;
  }
}

async function runPosVisitFlyers(pool, app) {
  if (flyerRunning) return;
  flyerRunning = true;
  try {
    const flyersRes = await pool.query(
      `SELECT id, establishment_id, caption, media_url, delay_hours
         FROM ai_flyers
        WHERE trigger_event = 'pos_visita' AND is_active = TRUE AND media_url <> ''`
    );

    let dispatched = 0;
    for (const flyer of flyersRes.rows) {
      const delay = Number(flyer.delay_hours) || 0;
      // Reservas elegíveis: já passou (data/hora + delay), não cancelada,
      // com telefone, dentro de uma janela recente (evita backfill em massa)
      // e que ainda não receberam este flyer.
      let reservations;
      try {
        reservations = await pool.query(
          `SELECT r.id, r.client_phone
             FROM restaurant_reservations r
            WHERE r.establishment_id = $1
              AND r.client_phone IS NOT NULL AND r.client_phone <> ''
              AND COALESCE(r.status, '') !~* 'cancel'
              AND (r.reservation_date + COALESCE(r.reservation_time, '00:00'::time))
                    <= NOW() - ($2 || ' hours')::interval
              AND r.reservation_date >= CURRENT_DATE - INTERVAL '3 days'
              AND NOT EXISTS (
                SELECT 1 FROM ai_flyer_sends s
                 WHERE s.flyer_id = $3 AND s.reservation_id = r.id AND s.trigger_event = 'pos_visita'
              )
            LIMIT 100`,
          [flyer.establishment_id, String(delay), flyer.id]
        );
      } catch (e) {
        console.warn('[whatsappMaintenance] consulta de reservas pós-visita falhou:', e.message);
        continue;
      }

      for (const reservation of reservations.rows) {
        const ok = await dispatchSingleFlyer(pool, app, {
          flyer,
          waId: reservation.client_phone,
          reservationId: reservation.id,
          event: 'pos_visita',
        });
        if (ok) dispatched += 1;
      }
    }

    if (dispatched > 0) {
      console.log(`[whatsappMaintenance] flyers pós-visita enviados: ${dispatched}`);
    }
  } catch (error) {
    console.error('[whatsappMaintenance] erro nos flyers pós-visita:', error.message);
  } finally {
    flyerRunning = false;
  }
}

function startWhatsappMaintenanceScheduler(pool, app) {
  if (process.env.ENABLE_WHATSAPP_MAINTENANCE_WORKERS === 'false') {
    console.log('[whatsappMaintenance] workers desabilitados por env.');
    return;
  }

  const startupDelayMs = Number(process.env.WHATSAPP_MAINTENANCE_STARTUP_DELAY_MS || 120_000);

  setTimeout(() => {
    runMediaCleanup(pool);
    runPosVisitFlyers(pool, app);
  }, startupDelayMs);

  cleanupTimer = setInterval(() => runMediaCleanup(pool), MEDIA_CLEANUP_INTERVAL_MS);
  flyerTimer = setInterval(() => runPosVisitFlyers(pool, app), FLYER_POSVISIT_INTERVAL_MS);

  if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();
  if (typeof flyerTimer.unref === 'function') flyerTimer.unref();

  console.log('[whatsappMaintenance] iniciado.');
}

module.exports = {
  startWhatsappMaintenanceScheduler,
};

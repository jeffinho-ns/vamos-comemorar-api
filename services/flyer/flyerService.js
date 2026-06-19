/**
 * Envio automático de flyers (imagens) disparado por eventos de reserva.
 * Eventos suportados: 'reserva_criada', 'reserva_cancelada', 'pos_visita'.
 * Idempotente por (flyer_id, reservation_id, trigger_event) via ai_flyer_sends.
 */
const inbox = require('../whatsappInboxRepository');
const outboundGateway = require('../messaging/outboundGateway');

function emitInbox(app, payload) {
  const io = app?.get?.('socketio');
  if (io) {
    io.to('whatsapp_inbox').emit('whatsapp_inbox_update', {
      type: payload?.type || 'refresh',
      wa_id: payload?.wa_id || null,
    });
  }
}

async function loadActiveFlyers(pool, establishmentId, event) {
  const r = await pool.query(
    `SELECT id, caption, media_url, delay_hours
       FROM ai_flyers
      WHERE establishment_id = $1 AND trigger_event = $2 AND is_active = TRUE AND media_url <> ''
      ORDER BY sort_order ASC, id ASC`,
    [Number(establishmentId), event]
  );
  return r.rows;
}

/** Reserva o envio; retorna true se ainda não havia sido enviado. */
async function claimSend(pool, { flyerId, reservationId, waId, event }) {
  try {
    const r = await pool.query(
      `INSERT INTO ai_flyer_sends (flyer_id, reservation_id, wa_id, trigger_event)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (flyer_id, reservation_id, trigger_event) DO NOTHING
       RETURNING id`,
      [flyerId, reservationId || null, String(waId || ''), event]
    );
    return r.rowCount > 0;
  } catch (e) {
    console.warn('[flyer] claimSend falhou:', e.message);
    return true;
  }
}

/**
 * Envia os flyers ativos de um evento para o número informado.
 * @returns {Promise<{ sent: number }>}
 */
async function sendFlyersForEvent(pool, app, { establishmentId, waId, event, reservationId = null }) {
  if (!pool || !establishmentId || !waId || !event) return { sent: 0 };
  const digits = String(waId).replace(/\D/g, '');
  if (!digits) return { sent: 0 };

  let flyers = [];
  try {
    flyers = await loadActiveFlyers(pool, establishmentId, event);
  } catch (e) {
    console.warn('[flyer] load falhou:', e.message);
    return { sent: 0 };
  }
  if (!flyers.length) return { sent: 0 };

  let conversation = null;
  try {
    conversation = await inbox.getConversationByWaId(pool, digits);
  } catch (_) {
    conversation = null;
  }

  let sent = 0;
  for (const flyer of flyers) {
    const ok = await sendOneFlyer(pool, { flyer, conversation, digits, event, reservationId });
    if (ok) sent += 1;
  }

  if (sent && app) emitInbox(app, { type: 'outbound', wa_id: digits });
  return { sent };
}

/** Envia um único flyer (usado pelo worker pós-visita, que respeita o delay por flyer). */
async function sendOneFlyer(pool, { flyer, conversation, digits, event, reservationId }) {
  try {
    const claimed = await claimSend(pool, {
      flyerId: flyer.id,
      reservationId,
      waId: digits,
      event,
    });
    if (!claimed) return false;

    await outboundGateway.sendImage(digits, { link: flyer.media_url, caption: flyer.caption });

    if (conversation?.id) {
      // mediaPublicId fica null de propósito: o expurgo de 24h não deve
      // apagar o arquivo do flyer (que é reutilizável).
      await inbox.insertMessage(pool, {
        conversationId: conversation.id,
        direction: 'outbound',
        body: flyer.caption || '',
        messageType: 'image',
        mediaUrl: flyer.media_url,
        mediaMime: 'image/jpeg',
        mediaPublicId: null,
        intent: 'FLYER',
        rawPayload: { flyer_id: flyer.id, event },
      });
    }
    return true;
  } catch (e) {
    console.warn(`[flyer] envio falhou flyer=${flyer.id} event=${event}:`, e.message);
    return false;
  }
}

/** Dispara um flyer específico para um número (resolve a conversa e emite realtime). */
async function dispatchSingleFlyer(pool, app, { flyer, waId, reservationId, event }) {
  const digits = String(waId || '').replace(/\D/g, '');
  if (!digits || !flyer?.media_url) return false;
  let conversation = null;
  try {
    conversation = await inbox.getConversationByWaId(pool, digits);
  } catch (_) {
    conversation = null;
  }
  const ok = await sendOneFlyer(pool, { flyer, conversation, digits, event, reservationId });
  if (ok && app) emitInbox(app, { type: 'outbound', wa_id: digits });
  return ok;
}

module.exports = {
  loadActiveFlyers,
  sendFlyersForEvent,
  dispatchSingleFlyer,
};

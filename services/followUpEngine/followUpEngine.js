const { sendMessage } = require('../whatsappService');
const inbox = require('../whatsappInboxRepository');

const PRE_EVENT_HOURS = Number(process.env.CONVERSATION_PRE_EVENT_HOURS || 24);
const POST_EVENT_HOURS = Number(process.env.CONVERSATION_POST_EVENT_HOURS || 24);

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function buildPreEventMessage(reservation) {
  const name = reservation.client_name || 'tudo bem';
  const house = reservation.establishment_name || 'nosso espaço';
  const date = reservation.reservation_date;
  const time = String(reservation.reservation_time || '').slice(0, 5);
  return `Oi, ${name}! Passando para lembrar da sua reserva no ${house} em ${date} às ${time}. Se precisar ajustar algo, é só me chamar por aqui.`;
}

function buildPostEventMessage(reservation) {
  const name = reservation.client_name || 'tudo bem';
  const house = reservation.establishment_name || 'nossa casa';
  return `Oi, ${name}! Esperamos que tenha curtido a experiência no ${house}. Como foi para você? Se quiser reservar de novo, estou por aqui.`;
}

async function listPreEventReservations(pool) {
  const result = await pool.query(
    `SELECT rr.id, rr.client_name, rr.client_phone, rr.reservation_date, rr.reservation_time,
            rr.establishment_id, p.name AS establishment_name
       FROM restaurant_reservations rr
       LEFT JOIN places p ON p.id = rr.establishment_id
      WHERE rr.client_phone IS NOT NULL
        AND rr.reservation_date IS NOT NULL
        AND LOWER(COALESCE(rr.status, '')) IN ('confirmed', 'checked-in', 'seated')
        AND (rr.reservation_date::timestamp + COALESCE(rr.reservation_time, '00:00:00'::time))
            BETWEEN NOW() + ($1::int * interval '1 hour') AND NOW() + (($1::int + 2) * interval '1 hour')
        AND NOT EXISTS (
          SELECT 1
            FROM reservation_whatsapp_followups f
           WHERE f.reservation_id = rr.id
             AND f.followup_type = 'pre_event'
        )
      ORDER BY rr.reservation_date ASC
      LIMIT 50`,
    [PRE_EVENT_HOURS]
  );
  return result.rows;
}

async function listPostEventReservations(pool) {
  const result = await pool.query(
    `SELECT rr.id, rr.client_name, rr.client_phone, rr.reservation_date, rr.reservation_time,
            rr.establishment_id, p.name AS establishment_name
       FROM restaurant_reservations rr
       LEFT JOIN places p ON p.id = rr.establishment_id
      WHERE rr.client_phone IS NOT NULL
        AND rr.reservation_date IS NOT NULL
        AND (rr.reservation_date::timestamp + COALESCE(rr.reservation_time, '00:00:00'::time))
            BETWEEN NOW() - (($1::int + 6) * interval '1 hour') AND NOW() - ($1::int * interval '1 hour')
        AND LOWER(COALESCE(rr.status, '')) IN ('confirmed', 'checked-in', 'seated', 'completed', 'finalized')
        AND NOT EXISTS (
          SELECT 1
            FROM reservation_whatsapp_followups f
           WHERE f.reservation_id = rr.id
             AND f.followup_type = 'post_event'
        )
      ORDER BY rr.reservation_date DESC
      LIMIT 50`,
    [POST_EVENT_HOURS]
  );
  return result.rows;
}

async function sendReservationFollowup(pool, app, reservation, followupType, messageBuilder) {
  const waId = normalizePhone(reservation.client_phone);
  if (!waId) return false;

  const message = messageBuilder(reservation);
  await sendMessage(waId, message);

  await pool.query(
    `INSERT INTO reservation_whatsapp_followups (reservation_id, wa_id, followup_type, message_body)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (reservation_id, followup_type) DO NOTHING`,
    [reservation.id, waId, followupType, message]
  );

  const conversation = await inbox.getConversationByWaId(pool, waId);
  if (conversation?.id) {
    await inbox.insertMessage(pool, {
      conversationId: conversation.id,
      direction: 'outbound',
      body: message,
      intent: followupType,
      suggestedReply: null,
      rawPayload: null,
    });
  }

  const io = app?.get?.('socketio');
  if (io) {
    io.to('whatsapp_inbox').emit('whatsapp_inbox_update', { type: followupType });
  }
  return true;
}

async function processFollowUpBatch(pool, app) {
  const preRows = await listPreEventReservations(pool);
  const postRows = await listPostEventReservations(pool);
  let preSent = 0;
  let postSent = 0;

  for (const reservation of preRows) {
    try {
      const ok = await sendReservationFollowup(pool, app, reservation, 'pre_event', buildPreEventMessage);
      if (ok) preSent += 1;
    } catch (error) {
      console.warn('[followUpEngine] falha no pré-evento:', { reservationId: reservation.id, error: error.message });
    }
  }

  for (const reservation of postRows) {
    try {
      const ok = await sendReservationFollowup(pool, app, reservation, 'post_event', buildPostEventMessage);
      if (ok) postSent += 1;
    } catch (error) {
      console.warn('[followUpEngine] falha no pós-evento:', { reservationId: reservation.id, error: error.message });
    }
  }

  return { preScanned: preRows.length, preSent, postScanned: postRows.length, postSent };
}

module.exports = {
  processFollowUpBatch,
  buildPreEventMessage,
  buildPostEventMessage,
};

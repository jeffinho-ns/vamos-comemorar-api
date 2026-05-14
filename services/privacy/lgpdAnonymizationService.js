const crypto = require('crypto');

function buildAnonymizedWaId(waId) {
  const digest = crypto.createHash('sha256').update(String(waId)).digest('hex').slice(0, 24);
  return `anon_${digest}`;
}

function scrubCollectedFields(collectedFields = {}) {
  const next = { ...(collectedFields || {}) };
  delete next.client_name;
  delete next.client_email;
  delete next.data_nascimento;
  return next;
}

function scrubReservationContext(context = {}) {
  const next = { ...(context || {}) };
  delete next.client_name;
  delete next.client_email;
  delete next.data_nascimento;
  delete next.contact_name;
  return next;
}

async function anonymizeSubjectData(pool, waId) {
  const normalizedWaId = String(waId || '').trim();
  if (!normalizedWaId) {
    return { ok: false, code: 'INVALID_WA_ID', message: 'wa_id é obrigatório.' };
  }

  const anonymizedWaId = buildAnonymizedWaId(normalizedWaId);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const conversationResult = await client.query(
      `SELECT id
         FROM whatsapp_conversations
        WHERE wa_id = $1
        LIMIT 1`,
      [normalizedWaId]
    );
    const conversationId = conversationResult.rows[0]?.id || null;

    await client.query(
      `UPDATE whatsapp_conversations
          SET wa_id = $2,
              contact_name = NULL,
              updated_at = NOW()
        WHERE wa_id = $1`,
      [normalizedWaId, anonymizedWaId]
    );

    await client.query(
      `UPDATE whatsapp_contacts
          SET wa_id = $2,
              contact_name = NULL,
              client_email = NULL,
              birth_date = NULL,
              notes = NULL,
              updated_at = NOW()
        WHERE wa_id = $1`,
      [normalizedWaId, anonymizedWaId]
    );

    await client.query(
      `UPDATE whatsapp_messages
          SET body = '[conteúdo removido por LGPD]',
              suggested_reply = NULL,
              raw_payload = NULL
        WHERE conversation_id IN (
          SELECT id FROM whatsapp_conversations WHERE wa_id = $1
        )`,
      [anonymizedWaId]
    );

    const stateRows = await client.query(
      `SELECT id, collected_fields, reservation_context
         FROM conversation_state
        WHERE wa_id = $1`,
      [normalizedWaId]
    );

    for (const row of stateRows.rows) {
      const collectedFields = scrubCollectedFields(row.collected_fields || {});
      const reservationContext = scrubReservationContext(row.reservation_context || {});

      await client.query(
        `UPDATE conversation_state
            SET wa_id = $2,
                collected_fields = $3::jsonb,
                reservation_context = $4::jsonb,
                last_question = NULL,
                updated_at = NOW()
          WHERE id = $1`,
        [row.id, anonymizedWaId, JSON.stringify(collectedFields), JSON.stringify(reservationContext)]
      );
    }

    await client.query(
      `UPDATE customer_operational_profile
          SET wa_id = $2,
              client_email = NULL,
              profile_summary = NULL,
              preferences = '{}'::jsonb,
              tags = '[]'::jsonb,
              updated_at = NOW()
        WHERE wa_id = $1`,
      [normalizedWaId, anonymizedWaId]
    );

    await client.query(
      `UPDATE conversation_funnel_events
          SET wa_id = $2,
              payload = COALESCE(payload, '{}'::jsonb) || $3::jsonb
        WHERE wa_id = $1`,
      [
        normalizedWaId,
        anonymizedWaId,
        JSON.stringify({ lgpd_anonymized: true, original_wa_id_removed: true }),
      ]
    );

    await client.query('COMMIT');

    return {
      ok: true,
      anonymizedWaId,
      conversationId,
      tablesTouched: [
        'whatsapp_conversations',
        'whatsapp_contacts',
        'whatsapp_messages',
        'conversation_state',
        'customer_operational_profile',
        'conversation_funnel_events',
      ],
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  anonymizeSubjectData,
  buildAnonymizedWaId,
};

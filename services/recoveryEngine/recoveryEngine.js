const outboundGateway = require('../messaging/outboundGateway');
const inbox = require('../whatsappInboxRepository');
const stateManager = require('../stateManager/stateManager');
const { FIELD_LABELS_PT } = require('../stateManager/conversationSteps');
const { recordEvent, EVENT_TYPES } = require('../metrics/conversationMetricsService');

const RECOVERY_IDLE_MINUTES = Number(process.env.CONVERSATION_RECOVERY_IDLE_MINUTES || 45);
const MAX_RECOVERY_ATTEMPTS = Number(process.env.CONVERSATION_MAX_RECOVERY_ATTEMPTS || 2);

function hasPartialSlots(collectedFields = {}) {
  return Object.keys(collectedFields || {}).some((key) => {
    const value = collectedFields[key];
    return value !== undefined && value !== null && value !== '';
  });
}

// P1-G: heurística simples pra detectar que o cliente desistiu da reserva
// na conversa recente. Quando isso é detectado, NÃO mandamos recovery_followup
// — seria spam (bug da Luiza, que já tinha respondido "Não obrigada").
const GIVEUP_PATTERNS = [
  /\bn[aã]o\s+(obrigad[ao]|quero|preciso|vou)/i,
  /\bn[aã]o\s+vou\s+(querer|precisar|fazer)/i,
  /\b(deixa|esquece|esquec[ea]|cancela|abandon[ao])\s+(pra\s+l[áa]|isso|por\s+enquanto)?/i,
  /\b(depois|outro\s*dia|mais\s+pra\s+frente|mais\s+tarde|talvez\s+depois|fica\s+pra\s+depois)\s+(eu\s+)?(volto|chamo|entro\s+em\s+contato|aviso|vejo|penso|decido)/i,
  /\bj[áa]\s+desisti/i,
  /\bobrigad[ao]\s*$/i,
  /\btchau\b/i,
  /\bvalеu\s*$/i,
];

function clientLikelyGaveUp(recentInboundBodies = []) {
  for (const raw of recentInboundBodies) {
    const text = String(raw || '').trim();
    if (!text) continue;
    for (const re of GIVEUP_PATTERNS) {
      if (re.test(text)) return true;
    }
  }
  return false;
}

function buildRecoveryMessage(stateRow, establishmentName = '') {
  const step = stateRow.current_step;
  const collected = stateRow.collected_fields || {};
  const missing = Array.isArray(stateRow.missing_fields) ? stateRow.missing_fields : [];
  const firstMissing = missing[0];
  const missingLabel = FIELD_LABELS_PT[firstMissing] || firstMissing || 'alguns dados';
  const house = establishmentName || 'a casa';

  if (step === 'time' || firstMissing === 'reservation_time') {
    return `Oi! Vi que você parou na escolha do horário. Ainda quer reservar no ${house}? Me diz o horário que prefere que eu continuo com você.`;
  }
  if (step === 'date' || firstMissing === 'reservation_date') {
    return `Oi! Vi que você parou na escolha da data. Ainda quer reservar no ${house}? Me fala a data que você prefere.`;
  }
  if (step === 'area' || firstMissing === 'area_id') {
    return `Oi! Vi que você parou na escolha da área. Ainda quer reservar no ${house}? Me diz qual área prefere.`;
  }
  if (step === 'party_size' || firstMissing === 'quantidade_convidados') {
    return `Oi! Vi que você parou na quantidade de pessoas. Ainda quer reservar no ${house}? Me fala quantas pessoas vêm.`;
  }
  if (step === 'establishment' || firstMissing === 'establishment_id') {
    return 'Oi! Vi que você começou uma reserva e parou na escolha do estabelecimento. Ainda quer continuar? Me diz qual casa você prefere.';
  }
  if (collected.reservation_date && collected.establishment_id) {
    return `Oi! Sua reserva no ${house} ainda não foi finalizada. Quer retomar de onde parou? Falta só ${missingLabel}.`;
  }
  return `Oi! Vi que sua reserva ficou pela metade. Quer retomar agora? Falta ${missingLabel}.`;
}

async function listRecoveryCandidates(pool) {
  const result = await pool.query(
    `SELECT cs.*, p.name AS establishment_name, c.human_takeover_until
       FROM conversation_state cs
       JOIN whatsapp_conversations c ON c.id = cs.conversation_id
       LEFT JOIN places p ON p.id = NULLIF(cs.collected_fields->>'establishment_id', '')::int
      WHERE cs.current_step NOT IN ('completed', 'handoff')
        AND cs.followup_status IN ('none', 'recovery_pending')
        AND cs.updated_at < NOW() - ($1::int * interval '1 minute')
        AND cs.recovery_attempts < $2
        AND cs.collected_fields <> '{}'::jsonb
        AND (c.human_takeover_until IS NULL OR c.human_takeover_until < NOW())
      ORDER BY cs.updated_at ASC
      LIMIT 50`,
    [RECOVERY_IDLE_MINUTES, MAX_RECOVERY_ATTEMPTS]
  );
  return result.rows.filter((row) => hasPartialSlots(row.collected_fields));
}

async function getRecentInboundBodies(pool, conversationId, limit = 4) {
  const r = await pool.query(
    `SELECT body FROM whatsapp_messages
      WHERE conversation_id = $1 AND direction = 'inbound'
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [conversationId, limit]
  );
  return (r.rows || []).map((row) => row.body || '');
}

async function processRecoveryBatch(pool, app) {
  const candidates = await listRecoveryCandidates(pool);
  let sent = 0;

  for (const row of candidates) {
    try {
      const humanActive = await inbox.isHumanTakeoverActive(pool, row.wa_id);
      if (humanActive) continue;

      // P1-G: respeita desistência explícita do cliente nas últimas mensagens.
      // Bug da Luiza: já tinha dito "Não obrigada" e mesmo assim recebia
      // recovery_followup 1h depois.
      try {
        const recentInbound = await getRecentInboundBodies(pool, row.conversation_id, 4);
        if (clientLikelyGaveUp(recentInbound)) {
          console.log(
            `[recoveryEngine] desistência detectada, pulando followup waId=${row.wa_id} conv=${row.conversation_id}`
          );
          // Marca como sent (mesmo sem mandar) pra não tentar de novo no próximo ciclo.
          await stateManager.persistState(pool, row.conversation_id, {
            followupStatus: 'recovery_skipped_giveup',
            lastFollowupAt: new Date().toISOString(),
            recoveryAttempts: (Number(row.recovery_attempts) || 0) + 1,
          });
          continue;
        }
      } catch (giveupCheckError) {
        console.warn('[recoveryEngine] falha ao checar desistência:', giveupCheckError.message);
      }

      const message = buildRecoveryMessage(row, row.establishment_name);
      await outboundGateway.sendText(row.wa_id, message);

      await inbox.insertMessage(pool, {
        conversationId: row.conversation_id,
        direction: 'outbound',
        body: message,
        intent: 'recovery_followup',
        suggestedReply: null,
        rawPayload: null,
      });

      await recordEvent(pool, {
        eventType: EVENT_TYPES.STEP_ABANDONED,
        conversationId: row.conversation_id,
        sessionId: row.session_id,
        waId: row.wa_id,
        establishmentId: Number(row.collected_fields?.establishment_id) || null,
        step: row.current_step,
        payload: { source: 'recovery_engine' },
      });

      await stateManager.persistState(pool, row.conversation_id, {
        followupStatus: 'recovery_sent',
        abandonedAt: row.abandoned_at || new Date().toISOString(),
        lastFollowupAt: new Date().toISOString(),
        recoveryAttempts: (Number(row.recovery_attempts) || 0) + 1,
      });

      const io = app?.get?.('socketio');
      if (io) {
        io.to('whatsapp_inbox').emit('whatsapp_inbox_update', { type: 'recovery_followup' });
      }
      sent += 1;
    } catch (error) {
      console.warn('[recoveryEngine] falha ao enviar recuperação:', {
        conversationId: row.conversation_id,
        error: error.message,
      });
    }
  }

  return { scanned: candidates.length, sent };
}

module.exports = {
  RECOVERY_IDLE_MINUTES,
  processRecoveryBatch,
  buildRecoveryMessage,
};

const {
  computeMissingFields,
  resolveCurrentStep,
  isTerminalStep,
  getStepPrompt,
} = require('./conversationSteps');
const { isConversationSafetyBlockEnabled } = require('../conversationTestingMode');

const MAX_STEP_RETRIES = Number(process.env.CONVERSATION_MAX_STEP_RETRIES || 3);

function parseJsonObject(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : fallback;
  } catch (_error) {
    return fallback;
  }
}

function parseJsonArray(value, fallback = []) {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (_error) {
    return fallback;
  }
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id,
    conversationId: row.conversation_id,
    waId: row.wa_id,
    currentStep: row.current_step,
    completedSteps: parseJsonArray(row.completed_steps),
    retryCount: Number(row.retry_count) || 0,
    collectedFields: parseJsonObject(row.collected_fields),
    missingFields: parseJsonArray(row.missing_fields),
    reservationContext: parseJsonObject(row.reservation_context),
    lastQuestion: row.last_question,
    lastIntent: row.last_intent,
    handoffRecommended: Boolean(row.handoff_recommended),
    emotionalState: row.emotional_state || null,
    leadTemperature: row.lead_temperature || null,
    leadType: row.lead_type || null,
    followupStatus: row.followup_status || 'none',
    abandonedAt: row.abandoned_at,
    lastFollowupAt: row.last_followup_at,
    recoveryAttempts: Number(row.recovery_attempts) || 0,
    stateVersion: Number(row.state_version) || 1,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

function buildStateSnapshot(state, options = {}) {
  const collectedFields = { ...(state.collectedFields || {}) };
  const lockedEstablishmentId = options.lockedEstablishmentId;
  if (lockedEstablishmentId) {
    collectedFields.establishment_id = lockedEstablishmentId;
  }

  const missingFields = computeMissingFields(collectedFields, options);
  const currentStep = isTerminalStep(state.currentStep)
    ? state.currentStep
    : resolveCurrentStep(collectedFields, options);

  return {
    ...state,
    collectedFields,
    missingFields,
    currentStep,
  };
}

async function getByConversationId(pool, conversationId) {
  const result = await pool.query(
    `SELECT id, session_id, conversation_id, wa_id, current_step, completed_steps,
            retry_count, collected_fields, missing_fields, reservation_context,
            last_question, last_intent, handoff_recommended, emotional_state,
            lead_temperature, lead_type, followup_status, abandoned_at,
            last_followup_at, recovery_attempts, state_version,
            updated_at, created_at
       FROM conversation_state
      WHERE conversation_id = $1
      LIMIT 1`,
    [conversationId]
  );
  return mapRow(result.rows[0]);
}

async function ensureSession(pool, { conversationId, waId, reservationContext = {} }) {
  const normalizedConversationId = Number(conversationId);
  const normalizedWaId = String(waId || '').trim();
  if (!Number.isFinite(normalizedConversationId) || normalizedConversationId <= 0) {
    throw new Error('conversationId inválido para ensureSession.');
  }
  if (!normalizedWaId) {
    throw new Error('waId inválido para ensureSession.');
  }

  const result = await pool.query(
    `INSERT INTO conversation_state (
       conversation_id, wa_id, current_step, completed_steps, retry_count,
       collected_fields, missing_fields, reservation_context, updated_at
     )
     VALUES ($1, $2, 'greeting', '[]'::jsonb, 0, '{}'::jsonb, $3::jsonb, $4::jsonb, NOW())
     ON CONFLICT (conversation_id) DO UPDATE SET
       wa_id = EXCLUDED.wa_id,
       updated_at = NOW()
     RETURNING id, session_id, conversation_id, wa_id, current_step, completed_steps,
               retry_count, collected_fields, missing_fields, reservation_context,
               last_question, last_intent, handoff_recommended, emotional_state,
               lead_temperature, lead_type, followup_status, abandoned_at,
               last_followup_at, recovery_attempts, state_version,
               updated_at, created_at`,
    [
      normalizedConversationId,
      normalizedWaId,
      JSON.stringify(computeMissingFields({})),
      JSON.stringify(reservationContext || {}),
    ]
  );

  return mapRow(result.rows[0]);
}

async function persistState(pool, conversationId, patch = {}) {
  const normalizedConversationId = Number(conversationId);
  if (!Number.isFinite(normalizedConversationId) || normalizedConversationId <= 0) {
    throw new Error('conversationId inválido para persistState.');
  }

  const sets = [];
  const params = [];
  let index = 1;

  const assign = (column, value) => {
    sets.push(`${column} = $${index++}`);
    params.push(value);
  };

  if (patch.currentStep !== undefined) assign('current_step', patch.currentStep);
  if (patch.completedSteps !== undefined) assign('completed_steps', JSON.stringify(patch.completedSteps));
  if (patch.retryCount !== undefined) assign('retry_count', patch.retryCount);
  if (patch.collectedFields !== undefined) assign('collected_fields', JSON.stringify(patch.collectedFields));
  if (patch.missingFields !== undefined) assign('missing_fields', JSON.stringify(patch.missingFields));
  if (patch.reservationContext !== undefined) {
    assign('reservation_context', JSON.stringify(patch.reservationContext));
  }
  if (patch.lastQuestion !== undefined) assign('last_question', patch.lastQuestion);
  if (patch.lastIntent !== undefined) assign('last_intent', patch.lastIntent);
  if (patch.handoffRecommended !== undefined) assign('handoff_recommended', patch.handoffRecommended);
  if (patch.emotionalState !== undefined) assign('emotional_state', patch.emotionalState);
  if (patch.leadTemperature !== undefined) assign('lead_temperature', patch.leadTemperature);
  if (patch.leadType !== undefined) assign('lead_type', patch.leadType);
  if (patch.followupStatus !== undefined) assign('followup_status', patch.followupStatus);
  if (patch.abandonedAt !== undefined) assign('abandoned_at', patch.abandonedAt);
  if (patch.lastFollowupAt !== undefined) assign('last_followup_at', patch.lastFollowupAt);
  if (patch.recoveryAttempts !== undefined) assign('recovery_attempts', patch.recoveryAttempts);

  if (sets.length === 0) {
    return getByConversationId(pool, normalizedConversationId);
  }

  sets.push('state_version = conversation_state.state_version + 1');
  sets.push('updated_at = NOW()');
  params.push(normalizedConversationId);

  const result = await pool.query(
    `UPDATE conversation_state
        SET ${sets.join(', ')}
      WHERE conversation_id = $${index}
      RETURNING id, session_id, conversation_id, wa_id, current_step, completed_steps,
                retry_count, collected_fields, missing_fields, reservation_context,
                last_question, last_intent, handoff_recommended, emotional_state,
                lead_temperature, lead_type, followup_status, abandoned_at,
                last_followup_at, recovery_attempts, state_version,
                updated_at, created_at`,
    params
  );

  return mapRow(result.rows[0]);
}

async function mergeCollectedFields(pool, conversationId, partialFields, options = {}) {
  const current = await getByConversationId(pool, conversationId);
  if (!current) {
    throw new Error('Sessão de estado não encontrada para mergeCollectedFields.');
  }

  const merged = {
    ...(current.collectedFields || {}),
    ...(partialFields || {}),
  };

  const snapshot = buildStateSnapshot(
    {
      ...current,
      collectedFields: merged,
    },
    options
  );

  return persistState(pool, conversationId, {
    collectedFields: snapshot.collectedFields,
    missingFields: snapshot.missingFields,
    currentStep: snapshot.currentStep,
    retryCount: 0,
    handoffRecommended: false,
  });
}

async function recordValidationFailure(pool, conversationId, { message, intent = null } = {}) {
  const current = await getByConversationId(pool, conversationId);
  if (!current) {
    throw new Error('Sessão de estado não encontrada para recordValidationFailure.');
  }

  const retryCount = (Number(current.retryCount) || 0) + 1;
  const handoffRecommended =
    isConversationSafetyBlockEnabled() && retryCount >= MAX_STEP_RETRIES;

  return persistState(pool, conversationId, {
    retryCount,
    handoffRecommended,
    lastQuestion: message || current.lastQuestion || null,
    lastIntent: intent || current.lastIntent || null,
    currentStep:
      handoffRecommended && isConversationSafetyBlockEnabled() ? 'handoff' : current.currentStep,
  });
}

async function markStepCompleted(pool, conversationId, stepName) {
  const current = await getByConversationId(pool, conversationId);
  if (!current) {
    throw new Error('Sessão de estado não encontrada para markStepCompleted.');
  }

  const completedSteps = Array.isArray(current.completedSteps) ? [...current.completedSteps] : [];
  if (stepName && !completedSteps.includes(stepName)) {
    completedSteps.push(stepName);
  }

  return persistState(pool, conversationId, {
    completedSteps,
  });
}

async function markHandoff(pool, conversationId, { intent = 'anti_loop_handoff' } = {}) {
  return persistState(pool, conversationId, {
    currentStep: 'handoff',
    handoffRecommended: true,
    lastIntent: intent,
    lastQuestion: getStepPrompt('handoff'),
  });
}

async function reopenFromHandoff(pool, conversationId, options = {}) {
  const current = await getByConversationId(pool, conversationId);
  if (!current) {
    throw new Error('Sessão de estado não encontrada para reopenFromHandoff.');
  }

  const snapshot = buildStateSnapshot(
    {
      ...current,
      currentStep: 'greeting',
      handoffRecommended: false,
      retryCount: 0,
    },
    options
  );

  return persistState(pool, conversationId, {
    currentStep: snapshot.currentStep,
    missingFields: snapshot.missingFields,
    collectedFields: snapshot.collectedFields,
    handoffRecommended: false,
    retryCount: 0,
    lastIntent: null,
  });
}

async function markCompleted(pool, conversationId) {
  return persistState(pool, conversationId, {
    currentStep: 'completed',
    retryCount: 0,
    handoffRecommended: false,
    missingFields: [],
    followupStatus: 'completed',
    abandonedAt: null,
  });
}

async function recordCommercialSignals(pool, conversationId, signals = {}) {
  return persistState(pool, conversationId, {
    emotionalState: signals.emotionalState,
    leadTemperature: signals.leadTemperature,
    leadType: signals.leadType,
    followupStatus: signals.followupStatus ?? 'none',
    abandonedAt: signals.abandonedAt ?? null,
  });
}

async function markRecoveryPending(pool, conversationId) {
  return persistState(pool, conversationId, {
    followupStatus: 'recovery_pending',
    abandonedAt: new Date().toISOString(),
  });
}

function shouldTriggerHandoff(state) {
  if (!isConversationSafetyBlockEnabled()) return false;
  return Number(state?.retryCount) >= MAX_STEP_RETRIES || state?.currentStep === 'handoff';
}

module.exports = {
  MAX_STEP_RETRIES,
  mapRow,
  buildStateSnapshot,
  getByConversationId,
  ensureSession,
  persistState,
  mergeCollectedFields,
  recordValidationFailure,
  markStepCompleted,
  markHandoff,
  reopenFromHandoff,
  markCompleted,
  recordCommercialSignals,
  markRecoveryPending,
  shouldTriggerHandoff,
};

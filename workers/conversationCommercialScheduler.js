const { processRecoveryBatch } = require('../services/recoveryEngine/recoveryEngine');
const { processFollowUpBatch } = require('../services/followUpEngine/followUpEngine');

const RECOVERY_INTERVAL_MS = Number(process.env.CONVERSATION_RECOVERY_INTERVAL_MS || 15 * 60 * 1000);
const FOLLOWUP_INTERVAL_MS = Number(process.env.CONVERSATION_FOLLOWUP_INTERVAL_MS || 30 * 60 * 1000);

let recoveryTimer = null;
let followupTimer = null;
let recoveryRunning = false;
let followupRunning = false;

async function runRecovery(pool, app) {
  if (recoveryRunning) return;
  recoveryRunning = true;
  try {
    const result = await processRecoveryBatch(pool, app);
    if (result.sent > 0) {
      console.log('[conversationCommercialScheduler] recovery:', result);
    }
  } catch (error) {
    console.error('[conversationCommercialScheduler] erro no recovery:', error.message);
  } finally {
    recoveryRunning = false;
  }
}

async function runFollowUp(pool, app) {
  if (followupRunning) return;
  followupRunning = true;
  try {
    const result = await processFollowUpBatch(pool, app);
    if (result.preSent > 0 || result.postSent > 0) {
      console.log('[conversationCommercialScheduler] follow-up:', result);
    }
  } catch (error) {
    console.error('[conversationCommercialScheduler] erro no follow-up:', error.message);
  } finally {
    followupRunning = false;
  }
}

function startConversationCommercialScheduler(pool, app) {
  if (process.env.ENABLE_CONVERSATION_COMMERCIAL_WORKERS === 'false') {
    console.log('[conversationCommercialScheduler] workers desabilitados por env.');
    return;
  }

  runRecovery(pool, app);
  runFollowUp(pool, app);

  recoveryTimer = setInterval(() => runRecovery(pool, app), RECOVERY_INTERVAL_MS);
  followupTimer = setInterval(() => runFollowUp(pool, app), FOLLOWUP_INTERVAL_MS);

  if (typeof recoveryTimer.unref === 'function') recoveryTimer.unref();
  if (typeof followupTimer.unref === 'function') followupTimer.unref();

  console.log('[conversationCommercialScheduler] iniciado.');
}

module.exports = {
  startConversationCommercialScheduler,
};

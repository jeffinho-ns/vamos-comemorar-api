require('dotenv').config();
const pool = require('../config/database');
const inbox = require('../services/whatsappInboxRepository');
const stateManager = require('../services/stateManager/stateManager');

async function main() {
  const waId = String(process.argv[2] || '').trim();
  if (!waId) {
    throw new Error('Informe o wa_id. Ex.: node scripts/reopen_whatsapp_conversation.js 5511943501097');
  }

  const conversation = await inbox.getConversationByWaId(pool, waId);
  if (!conversation) {
    throw new Error(`Conversa não encontrada para wa_id ${waId}.`);
  }

  await inbox.clearHumanTakeover(pool, waId);
  await stateManager.persistState(pool, conversation.id, {
    currentStep: 'greeting',
    collectedFields: {},
    completedSteps: [],
    retryCount: 0,
    handoffRecommended: false,
  });
  const state = stateManager.buildStateSnapshot(
    await stateManager.getByConversationId(pool, conversation.id),
    {}
  );
  await stateManager.persistState(pool, conversation.id, {
    currentStep: state.currentStep,
    missingFields: state.missingFields,
  });

  console.log(
    JSON.stringify(
      {
        wa_id: waId,
        conversation_id: conversation.id,
        current_step: state.currentStep,
        human_takeover_cleared: true,
      },
      null,
      2
    )
  );

  await pool.end();
}

main().catch(async (error) => {
  console.error(error.message);
  try {
    await pool.end();
  } catch (_error) {
    // ignore
  }
  process.exit(1);
});

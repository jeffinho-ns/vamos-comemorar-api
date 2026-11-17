'use strict';

const { loadActiveSettings } = require('../agent/assistantSettingsService');

function shouldReplyToCustomer({ onlyNewCustomers, hadHistory, alreadyEngaged }) {
  if (!onlyNewCustomers) return true;
  if (alreadyEngaged) return true;
  return !hadHistory;
}

function readNewCustomerPolicy(settings) {
  const config = settings?.behavior_config;
  if (!config || config.responder_apenas_numeros_novos !== true) {
    return { onlyNewCustomers: false, cutoff: null };
  }
  const cutoff = new Date(config.ai_reply_after || '');
  if (Number.isNaN(cutoff.getTime())) {
    return { onlyNewCustomers: false, cutoff: null };
  }
  return { onlyNewCustomers: true, cutoff };
}

async function conversationFlags(pool, conversationId, cutoff) {
  const result = await pool.query(
    `SELECT
       EXISTS (
         SELECT 1
           FROM whatsapp_messages
          WHERE conversation_id = $1
            AND created_at < $2
       ) AS had_history,
       EXISTS (
         SELECT 1
           FROM whatsapp_messages
          WHERE conversation_id = $1
            AND direction = 'outbound'
            AND created_at >= $2
            AND COALESCE(intent, '') <> 'WAME_HISTORY'
       ) AS already_engaged`,
    [conversationId, cutoff]
  );
  const row = result.rows[0] || {};
  return {
    hadHistory: row.had_history === true,
    alreadyEngaged: row.already_engaged === true,
  };
}

async function shouldSilenceParkedCustomer(pool, { establishmentId, conversationId }) {
  const id = Number(establishmentId);
  const conversation = Number(conversationId);
  if (!pool || !Number.isFinite(id) || id <= 0 || !Number.isFinite(conversation) || conversation <= 0) {
    return false;
  }
  const settings = await loadActiveSettings(pool, id).catch(() => null);
  const policy = readNewCustomerPolicy(settings);
  if (!policy.onlyNewCustomers) return false;
  const flags = await conversationFlags(pool, conversation, policy.cutoff);
  return !shouldReplyToCustomer({ onlyNewCustomers: true, ...flags });
}

module.exports = {
  shouldReplyToCustomer,
  readNewCustomerPolicy,
  shouldSilenceParkedCustomer,
};

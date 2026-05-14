function isConversationTestingModeEnabled() {
  const raw = String(process.env.WHATSAPP_AI_TESTING_MODE ?? 'true').trim().toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(raw);
}

function isConversationSafetyBlockEnabled() {
  return !isConversationTestingModeEnabled();
}

module.exports = {
  isConversationTestingModeEnabled,
  isConversationSafetyBlockEnabled,
};

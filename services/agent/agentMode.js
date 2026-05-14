function isAgentModeEnabled() {
  const raw = String(process.env.WHATSAPP_AGENT_MODE ?? 'true').trim().toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(raw);
}

module.exports = {
  isAgentModeEnabled,
};

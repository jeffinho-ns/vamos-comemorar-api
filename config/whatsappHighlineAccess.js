/**
 * Inbox WhatsApp restrito ao HighLine para estes e-mails.
 * Não remove outras permissões do utilizador — só limita rotas /api/admin/whatsapp.
 */
const WHATSAPP_HIGHLINE_ONLY_EMAILS = new Set(['reservas@highlinebar.com.br']);

const { getOperationalIdForProfile } = require('../tenancy/operationalProfileIds');

function resolveHighlineEstablishmentId() {
  return getOperationalIdForProfile('highline');
}

function isWhatsappHighlineOnlyEmail(email) {
  if (!email) return false;
  return WHATSAPP_HIGHLINE_ONLY_EMAILS.has(String(email).toLowerCase().trim());
}

function getWhatsappHighlineOnlyEstablishmentIds(user) {
  if (!isWhatsappHighlineOnlyEmail(user?.email)) return null;
  const highlineId = resolveHighlineEstablishmentId();
  if (Number.isFinite(highlineId) && highlineId > 0) return [highlineId];
  const envId = Number(
    process.env.HIGHLINE_ESTABLISHMENT_ID || process.env.WHATSAPP_DEFAULT_ESTABLISHMENT_ID || '',
  );
  if (Number.isFinite(envId) && envId > 0) return [envId];
  return null;
}

module.exports = {
  WHATSAPP_HIGHLINE_ONLY_EMAILS,
  resolveHighlineEstablishmentId,
  isWhatsappHighlineOnlyEmail,
  getWhatsappHighlineOnlyEstablishmentIds,
};

Object.defineProperty(module.exports, 'HIGHLINE_ESTABLISHMENT_ID', {
  enumerable: true,
  get: resolveHighlineEstablishmentId,
});

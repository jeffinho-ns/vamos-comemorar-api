/**
 * Inbox WhatsApp restrito ao HighLine (establishment_id 7) para estes e-mails.
 * Não remove outras permissões do utilizador — só limita rotas /api/admin/whatsapp.
 */
const WHATSAPP_HIGHLINE_ONLY_EMAILS = new Set(['reservas@highlinebar.com.br']);

const HIGHLINE_ESTABLISHMENT_ID = Number(
  process.env.HIGHLINE_ESTABLISHMENT_ID ||
    process.env.WHATSAPP_DEFAULT_ESTABLISHMENT_ID ||
    7
);

function isWhatsappHighlineOnlyEmail(email) {
  if (!email) return false;
  return WHATSAPP_HIGHLINE_ONLY_EMAILS.has(String(email).toLowerCase().trim());
}

function getWhatsappHighlineOnlyEstablishmentIds(user) {
  if (!isWhatsappHighlineOnlyEmail(user?.email)) return null;
  if (!Number.isFinite(HIGHLINE_ESTABLISHMENT_ID) || HIGHLINE_ESTABLISHMENT_ID <= 0) {
    return [7];
  }
  return [HIGHLINE_ESTABLISHMENT_ID];
}

module.exports = {
  WHATSAPP_HIGHLINE_ONLY_EMAILS,
  HIGHLINE_ESTABLISHMENT_ID,
  isWhatsappHighlineOnlyEmail,
  getWhatsappHighlineOnlyEstablishmentIds,
};

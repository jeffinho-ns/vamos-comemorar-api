/**
 * Estabelecimento padrão do canal WhatsApp (ex.: número exclusivo do HighLine).
 * WHATSAPP_DEFAULT_ESTABLISHMENT_ID ou HIGHLINE_ESTABLISHMENT_ID; fallback 7.
 */
function getWhatsappDefaultEstablishmentId() {
  const raw =
    process.env.WHATSAPP_DEFAULT_ESTABLISHMENT_ID ||
    process.env.HIGHLINE_ESTABLISHMENT_ID ||
    '7';
  const id = Number(raw);
  if (Number.isFinite(id) && id > 0) return id;
  return 7;
}

module.exports = {
  getWhatsappDefaultEstablishmentId,
};

'use strict';

const {
  getOperationalIdForProfile,
} = require('../../tenancy/operationalProfileIds');

/**
 * Estabelecimento padrão do canal WhatsApp (ex.: número exclusivo do HighLine).
 * WHATSAPP_DEFAULT_ESTABLISHMENT_ID ou profile highline no catálogo SaaS.
 */
function getWhatsappDefaultEstablishmentId() {
  const envRaw =
    process.env.WHATSAPP_DEFAULT_ESTABLISHMENT_ID ||
    process.env.HIGHLINE_ESTABLISHMENT_ID;
  if (envRaw) {
    const id = Number(envRaw);
    if (Number.isFinite(id) && id > 0) return id;
  }
  const fromProfile = getOperationalIdForProfile('highline');
  if (Number.isFinite(fromProfile) && fromProfile > 0) return fromProfile;
  return null;
}

function toPositiveHouseId(value) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * Casa da conversa atual. last_establishment_id do contato NÃO trava casa:
 * o mesmo cliente no Highline e no número central são funis separados.
 * Prioridade: menção no texto > establishment_id da conversa > null.
 */
function resolveConversationHouseId({
  conversationEstablishmentId,
  contactLastEstablishmentId: _contactLastEstablishmentId,
  mentionedId,
} = {}) {
  return toPositiveHouseId(mentionedId) || toPositiveHouseId(conversationEstablishmentId) || null;
}

module.exports = {
  getWhatsappDefaultEstablishmentId,
  resolveConversationHouseId,
};

const IG_PREFIX = 'ig:';

function isInstagramWaId(value) {
  return String(value || '').trim().toLowerCase().startsWith(IG_PREFIX);
}

function toInstagramWaId(igsid) {
  const id = String(igsid || '').replace(/\D/g, '');
  if (!id) return null;
  return `${IG_PREFIX}${id}`;
}

function instagramSenderId(waId) {
  const raw = String(waId || '').trim();
  if (!raw) return null;
  if (raw.toLowerCase().startsWith(IG_PREFIX)) {
    const id = raw.slice(IG_PREFIX.length).replace(/\D/g, '');
    return id || null;
  }
  return null;
}

function channelFromWaId(waId) {
  return isInstagramWaId(waId) ? 'instagram' : 'whatsapp';
}

function normalizeBrPhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (!digits) return null;
  digits = digits.replace(/^0+/, '');
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (digits.length < 12 || digits.length > 13) return null;
  if (!digits.startsWith('55')) return null;
  return digits;
}

function parseBrPhoneFromText(text) {
  const raw = String(text || '');
  const candidates = raw.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-.\s]?\d{4}/g) || [];
  for (const candidate of candidates) {
    const phone = normalizeBrPhone(candidate);
    if (phone) return phone;
  }
  const compact = normalizeBrPhone(raw);
  if (compact && /^\s*[\d+\s().-]{10,20}\s*$/.test(raw)) return compact;
  return null;
}

function resolveReservationPhone({ waId, clientPhone, cliente = {} } = {}) {
  const fromCliente = normalizeBrPhone(cliente.telefone || cliente.phone || cliente.whatsapp);
  if (fromCliente) return fromCliente;
  const fromState = normalizeBrPhone(clientPhone);
  if (fromState) return fromState;
  if (isInstagramWaId(waId)) return null;
  return normalizeBrPhone(waId) || String(waId || '').replace(/\D/g, '') || null;
}

module.exports = {
  IG_PREFIX,
  isInstagramWaId,
  toInstagramWaId,
  instagramSenderId,
  channelFromWaId,
  normalizeBrPhone,
  parseBrPhoneFromText,
  resolveReservationPhone,
};

/**
 * Pracinha: o cliente escolhe só Balcão ou Praça.
 * Apê não é mesa — não resolve área de reserva.
 */

function normalizePracinhaAreaText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function resolvePracinhaGuestArea(text) {
  const normalized = normalizePracinhaAreaText(text);
  if (!normalized) return null;
  if (/\bape\b/.test(normalized)) return null;
  if (/\b(balcao|salao|interno|parte de cima|la em cima)\b/.test(normalized)) {
    return { label: 'Balcão', key: 'balcao' };
  }
  if (/\b(praca|externo|externa|parte de baixo|lado de fora|do lado de fora)\b/.test(normalized)) {
    return { label: 'Praça', key: 'praca' };
  }
  return null;
}

module.exports = {
  resolvePracinhaGuestArea,
};

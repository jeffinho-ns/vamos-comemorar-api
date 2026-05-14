function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const WORD_NUMBERS = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
};

function parseQuantityFromText(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return { ok: false, confidence: 'none', reason: 'empty_text' };
  }

  const direct = normalized.match(/\b(\d{1,3})\s*(pessoas?|convidados?|amigos?|pax|pessoas)\b/);
  if (direct) {
    const quantity = Number(direct[1]);
    if (Number.isFinite(quantity) && quantity > 0) {
      return { ok: true, quantity, confidence: 'high', source: 'explicit_count' };
    }
  }

  const loose = normalized.match(/\b(?:umas?|cerca de|mais ou menos|aproximadamente)\s+(\d{1,3})\b/);
  if (loose) {
    const quantity = Number(loose[1]);
    if (Number.isFinite(quantity) && quantity > 0) {
      return {
        ok: true,
        quantity,
        confidence: 'medium',
        source: 'approximate_count',
        ambiguous: true,
      };
    }
  }

  const wordMatch = normalized.match(
    /\b(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|vinte|trinta|quarenta|cinquenta)\b/
  );
  if (wordMatch && /\b(pessoas?|convidados?|amigos?|gente|nos|somos)\b/.test(normalized)) {
    const quantity = WORD_NUMBERS[wordMatch[1]];
    if (quantity) {
      return { ok: true, quantity, confidence: 'medium', source: 'word_number' };
    }
  }

  const onlyNumber = normalized.match(/^\s*(\d{1,3})\s*$/);
  if (onlyNumber) {
    const quantity = Number(onlyNumber[1]);
    if (Number.isFinite(quantity) && quantity > 0) {
      return { ok: true, quantity, confidence: 'high', source: 'bare_number' };
    }
  }

  return { ok: false, confidence: 'none', reason: 'unparsed' };
}

module.exports = {
  parseQuantityFromText,
};

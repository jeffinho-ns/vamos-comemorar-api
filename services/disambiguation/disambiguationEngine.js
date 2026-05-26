function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function findEstablishmentCandidates(messageText, establishments = []) {
  const normalized = normalizeText(messageText);
  if (!normalized) return [];

  const matches = [];
  for (const establishment of establishments) {
    const name = normalizeText(establishment?.name);
    if (!name || name.length < 3) continue;
    if (normalized.includes(name)) {
      matches.push({
        id: Number(establishment.id),
        name: establishment.name,
      });
    }
  }

  const unique = new Map();
  for (const item of matches) {
    if (Number.isFinite(item.id) && item.id > 0) {
      unique.set(item.id, item);
    }
  }
  return [...unique.values()];
}

function findAreaCandidates(messageText, areas = [], establishmentId = null) {
  const normalized = normalizeText(messageText);
  if (!normalized) return [];

  const filtered = (areas || []).filter((area) => {
    if (!establishmentId) return true;
    return Number(area.establishment_id) === Number(establishmentId);
  });

  const matches = [];
  for (const area of filtered) {
    const name = normalizeText(area?.name);
    if (!name || name.length < 3) continue;
    if (normalized.includes(name)) {
      matches.push({
        id: Number(area.id),
        name: area.name,
        establishment_id: area.establishment_id || establishmentId || null,
      });
    }
  }

  const unique = new Map();
  for (const item of matches) {
    if (Number.isFinite(item.id) && item.id > 0) {
      unique.set(item.id, item);
    }
  }
  return [...unique.values()];
}

function buildNumberedOptions(candidates = [], labelPrefix = 'Opção') {
  return (candidates || [])
    .map((candidate, index) => `${index + 1}. ${candidate.name}`)
    .join('\n');
}

function buildDisambiguationReply(type, candidates = []) {
  if (!candidates.length) return null;
  const noun = type === 'area' ? 'área' : 'casa';
  const options = buildNumberedOptions(candidates);
  return `Achei mais de uma ${noun} que combina. Qual dessas você quer? Manda só o número:\n${options}`;
}

function parseNumericChoice(messageText, maxOptions) {
  const match = String(messageText || '').trim().match(/^(\d{1,2})$/);
  if (!match) return null;
  const choice = Number(match[1]);
  if (!Number.isFinite(choice) || choice < 1 || choice > maxOptions) return null;
  return choice - 1;
}

function resolvePendingDisambiguation(messageText, pending) {
  if (!pending?.candidates?.length) return null;
  const index = parseNumericChoice(messageText, pending.candidates.length);
  if (index === null) return null;
  const selected = pending.candidates[index];
  if (!selected) return null;
  return selected;
}

module.exports = {
  findEstablishmentCandidates,
  findAreaCandidates,
  buildDisambiguationReply,
  resolvePendingDisambiguation,
};

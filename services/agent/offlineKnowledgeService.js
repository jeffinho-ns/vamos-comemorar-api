const fs = require('fs');
const path = require('path');
const {
  detectRelevantFaqTopics,
  loadRelevantFaqsForEstablishment,
} = require('./faqPrefetchService');
const {
  isCustomerFacingFaqEntry,
  stripMetaInstructionsFromAnswer,
} = require('./faqPromptFilter');
const { looksLikeReservationIntent } = require('./reservationDateHint');
const { isInformationalFaqTurn } = require('./faqTopicCanonical');
const {
  loadActiveSettings,
  loadExternalLinksBlock,
} = require('./assistantSettingsService');
const { recordZeroTokenPath } = require('./aiUsageRepository');

let formatTrainingReply;
try {
  formatTrainingReply = require('./trainingReplyFormatter').formatTrainingReply;
} catch (_error) {
  formatTrainingReply = ({ answer }) => ({
    text: String(answer || '').trim(),
    usedSettings: false,
  });
}

const OFFLINE_KNOWLEDGE_DIR = path.join(__dirname, '../../data/offline-knowledge');
const OFFLINE_MAX_CHARS = 4000;
const HIGHLINE_ESTABLISHMENT_ID = Number(process.env.HIGHLINE_ESTABLISHMENT_ID || 7);

/** Bidirectional topic aliases for offline pack / DB matching. */
const TOPIC_ALIASES = {
  horario_funcionamento: ['dias_horarios_funcionamento'],
  dias_horarios_funcionamento: ['horario_funcionamento'],
  aniversarios: ['beneficios_aniversario'],
  beneficios_aniversario: ['aniversarios'],
};

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function slugFromName(establishmentName) {
  const name = normalizeText(establishmentName);
  if (!name) return '';
  return name.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function formatAnswerForWhatsApp(answer, establishmentName = '') {
  let text = stripMetaInstructionsFromAnswer(answer);
  if (!text) return '';
  if (establishmentName && text.length < 420) {
    return text;
  }
  return text;
}

function resolvePackFileName(establishmentId, establishmentName) {
  const id = Number(establishmentId);
  const name = normalizeText(establishmentName);
  const candidates = [];

  if (Number.isFinite(id) && id > 0) {
    candidates.push(`${id}.json`);
  }

  const slug = slugFromName(establishmentName);
  if (slug) {
    candidates.push(`${slug}.json`);
  }

  if (id === HIGHLINE_ESTABLISHMENT_ID || name.includes('highline') || name.includes('high line')) {
    candidates.push('highline.json');
  }

  candidates.push('default.json');

  const seen = new Set();
  for (const fileName of candidates) {
    if (seen.has(fileName)) continue;
    seen.add(fileName);
    if (fs.existsSync(path.join(OFFLINE_KNOWLEDGE_DIR, fileName))) {
      return fileName;
    }
  }

  return null;
}

function loadOfflinePackSync(establishmentId, establishmentName) {
  const fileName = resolvePackFileName(establishmentId, establishmentName);
  if (!fileName) return null;

  const filePath = path.join(OFFLINE_KNOWLEDGE_DIR, fileName);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.topics)) return null;
    return parsed;
  } catch (error) {
    console.warn('[offlineKnowledgeService] falha ao ler pack offline:', error.message);
    return null;
  }
}

function expandTopicHintsWithAliases(topicHints = []) {
  const expanded = [...topicHints];
  for (const topic of topicHints) {
    const aliases = TOPIC_ALIASES[topic] || [];
    for (const alias of aliases) {
      if (!expanded.includes(alias)) expanded.push(alias);
    }
  }
  return expanded;
}

function expandEntriesWithTopicAliases(entries) {
  const byTopic = new Map();
  for (const entry of entries) {
    const topic = String(entry?.topic || '').trim();
    if (!topic || byTopic.has(topic)) continue;
    byTopic.set(topic, entry);
  }

  const result = [...entries];
  for (const entry of entries) {
    const topic = String(entry?.topic || '').trim();
    const aliases = TOPIC_ALIASES[topic] || [];
    for (const alias of aliases) {
      if (!byTopic.has(alias)) {
        const aliasEntry = { ...entry, topic: alias };
        result.push(aliasEntry);
        byTopic.set(alias, aliasEntry);
      }
    }
  }
  return result;
}

function expandTopicHintsFromPack(userText, pack, topicHints = []) {
  const hints = [...topicHints];
  const normalized = normalizeText(userText);
  if (!pack?.topics?.length || !normalized) return hints;

  for (const entry of pack.topics) {
    const topic = String(entry?.topic || '').trim();
    if (!topic) continue;

    const keywords = Array.isArray(entry.keywords) ? entry.keywords : [];
    const matched = keywords.some((keyword) => normalized.includes(normalizeText(keyword)));
    if (matched && !hints.includes(topic)) {
      hints.unshift(topic);
    }
  }

  return expandTopicHintsWithAliases(hints);
}

function pickBestOfflineAnswer(topicHints, entries) {
  const expandedHints = expandTopicHintsWithAliases(topicHints);
  const byTopic = new Map();
  for (const entry of entries) {
    if (!isCustomerFacingFaqEntry(entry, { forOffline: true })) continue;
    const topic = String(entry.topic || '').trim();
    if (!topic || byTopic.has(topic)) continue;
    byTopic.set(topic, entry);
  }

  for (const topic of expandedHints) {
    const entry = byTopic.get(topic);
    if (entry?.answer) return entry;
  }

  for (const entry of entries) {
    if (isCustomerFacingFaqEntry(entry, { forOffline: true })) return entry;
  }

  return null;
}

/**
 * Tries to answer without OpenAI using:
 * 1) establishment_faq in DB (same Treinamento IA panel data)
 * 2) optional JSON pack at data/offline-knowledge/{id|slug|default}.json
 */
async function tryOfflineKnowledgeReply(pool, {
  establishmentId,
  establishmentName,
  userText,
  messageHistory = [],
}) {
  const question = String(userText || '').trim();
  if (!question) {
    return { ok: false, reason: 'empty_input' };
  }

  const establishment = Number(establishmentId);
  if (!Number.isFinite(establishment) || establishment <= 0) {
    return { ok: false, reason: 'missing_establishment' };
  }

  let topicHints = detectRelevantFaqTopics(question, messageHistory, {
    establishmentId: establishment,
    establishmentName,
  });
  const pack = loadOfflinePackSync(establishment, establishmentName);
  topicHints = expandTopicHintsFromPack(question, pack, topicHints);

  let entries = [];
  let source = 'db';

  if (pool) {
    entries = await loadRelevantFaqsForEstablishment(pool, establishment, topicHints, {
      maxChars: OFFLINE_MAX_CHARS,
    });
    entries = entries.filter((entry) => isCustomerFacingFaqEntry(entry, { forOffline: true }));
    entries = expandEntriesWithTopicAliases(entries);
  }

  if (!entries.length && pack?.topics?.length) {
    entries = pack.topics
      .map((item) => ({
        topic: String(item.topic || '').trim(),
        answer: String(item.answer || '').trim(),
        fromFile: true,
      }))
      .filter((entry) => isCustomerFacingFaqEntry(entry, { forOffline: true }));
    entries = expandEntriesWithTopicAliases(entries);
    source = 'file';
  }

  const reservationIntent = looksLikeReservationIntent(question);
  const informationalTurn = isInformationalFaqTurn(question);

  if (!entries.length) {
    if (reservationIntent && !informationalTurn) {
      return { ok: false, reason: 'reservation_no_faq' };
    }
    return { ok: false, reason: 'no_match' };
  }

  const best = pickBestOfflineAnswer(topicHints, entries);
  if (!best?.answer) {
    if (reservationIntent && !informationalTurn) {
      return { ok: false, reason: 'reservation_no_faq' };
    }
    return { ok: false, reason: 'no_customer_facing_answer' };
  }

  if (reservationIntent && !informationalTurn) {
    return { ok: false, reason: 'reservation_no_faq' };
  }

  const [settings, externalLinksBlock] = await Promise.all([
    pool ? loadActiveSettings(pool, establishment).catch(() => null) : Promise.resolve(null),
    pool
      ? loadExternalLinksBlock(pool, establishment).catch(() => '')
      : Promise.resolve(''),
  ]);

  const formatted = formatTrainingReply({
    answer: best.answer,
    topic: best.topic,
    settings,
    externalLinksBlock,
    establishmentName: establishmentName || '',
    userText: question,
    messageHistory,
  });

  const text = String(formatted?.text || '').trim();
  if (!text) {
    return { ok: false, reason: 'empty_answer' };
  }

  await recordZeroTokenPath(pool, {
    path: 'offline',
    meta: {
      topic: best.topic,
      topics: topicHints,
      establishment_id: establishment,
      source: best.fromFile ? 'file' : source,
      zero_token: true,
    },
  }).catch(() => {});

  return {
    ok: true,
    text,
    topic: best.topic,
    source: best.fromFile ? 'file' : source,
    usedSettings: Boolean(formatted?.usedSettings),
  };
}

module.exports = {
  tryOfflineKnowledgeReply,
  loadOfflinePackSync,
  resolvePackFileName,
  TOPIC_ALIASES,
};

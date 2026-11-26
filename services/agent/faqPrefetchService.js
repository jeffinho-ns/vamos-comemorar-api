const OpenAI = require('openai');
const { buildFaqTopicCandidates, getDefaultFaqAnswer } = require('./agentTools');
const {
  detectFaqTopicsFromConversation,
  expandFaqTopicSeedAliases,
  extractPartySizeFromText,
  looksLikeEventProgramQuestion,
  normalizeTopicKey,
} = require('./faqTopicCanonical');
const { isHighlineEstablishment } = require('./highlineReservationAreas');
const { resolveDateFromConversation } = require('../../nlp/dateResolver');
const {
  FAQ_MAX_CHARS_PER_TURN,
  FAQ_MAX_CHARS_FUNNEL,
  FAQ_CORE_FALLBACK_TOPICS,
  getModelForTask,
  applyOutputLimit,
} = require('./openAiConfig');
const { recordOpenAiUsageSafe } = require('./aiUsageRepository');
const { filterFaqsForCustomerPrompt } = require('./faqPromptFilter');
const { AgentPromptBuilder } = require('./AgentPromptBuilder');
const {
  customerFacingFaqText,
  shouldExecuteAsInstruction,
} = require('./faqAnswerRole');

const faqPersonaBuilder = new AgentPromptBuilder();

const FAQ_ANSWER_CACHE = new Map();
const FAQ_ALL_ACTIVE_CACHE = new Map();
const FAQ_CACHE_TTL_MS = Number(process.env.FAQ_CACHE_TTL_MS || 60_000);

let openaiClient = null;

function cloneFaqEntry(entry) {
  if (!entry) return null;
  return { ...entry };
}

function cloneFaqEntries(entries = []) {
  return entries.map((entry) => ({ ...entry }));
}

function invalidateFaqCache(establishmentId) {
  if (establishmentId === undefined) {
    FAQ_ANSWER_CACHE.clear();
    FAQ_ALL_ACTIVE_CACHE.clear();
    return;
  }
  const id = Number(establishmentId);
  const prefix = `${id}::`;
  for (const key of FAQ_ANSWER_CACHE.keys()) {
    if (key.startsWith(prefix)) {
      FAQ_ANSWER_CACHE.delete(key);
    }
  }
  FAQ_ALL_ACTIVE_CACHE.delete(id);
}

function getOpenAI() {
  if (!openaiClient) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY não definida no ambiente.');
    openaiClient = new OpenAI({ apiKey: key });
  }
  return openaiClient;
}

async function fetchFaqAnswerForTopicFromDb(pool, establishmentId, topicHint) {
  const candidates = buildFaqTopicCandidates(topicHint);
  if (!candidates.length) return null;

  let best = null;
  for (const candidate of candidates) {
    const result = await pool.query(
      `SELECT topic, answer, updated_at
         FROM establishment_faq
        WHERE establishment_id = $1
          AND topic = $2
          AND is_active = TRUE
        LIMIT 1`,
      [establishmentId, candidate]
    );
    const row = result.rows[0];
    if (!row?.answer) continue;
    const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : 0;
    if (!best || updatedAt > best.updatedAt) {
      best = {
        topic: row.topic,
        answer: String(row.answer).trim(),
        updatedAt,
      };
    }
  }
  return best;
}

async function fetchFaqAnswerForTopic(pool, establishmentId, topicHint) {
  const establishment = Number(establishmentId);
  if (!Number.isFinite(establishment) || establishment <= 0 || !pool) return null;

  const topic = String(topicHint || '').trim();
  if (!topic) return null;

  const cacheKey = `${establishment}::${topic}`;
  const now = Date.now();
  const cached = FAQ_ANSWER_CACHE.get(cacheKey);
  if (cached && now - cached.at < FAQ_CACHE_TTL_MS) {
    return cloneFaqEntry(cached.value);
  }

  const value = await fetchFaqAnswerForTopicFromDb(pool, establishment, topicHint);
  FAQ_ANSWER_CACHE.set(cacheKey, { at: now, value });
  return cloneFaqEntry(value);
}

async function prefetchEstablishmentFaqs(pool, establishmentId, topicHints = []) {
  const establishment = Number(establishmentId);
  if (!Number.isFinite(establishment) || establishment <= 0 || !pool) return [];

  const topics = [...new Set((topicHints || []).filter(Boolean))];
  const entries = [];

  for (const topic of topics) {
    const row = await fetchFaqAnswerForTopic(pool, establishment, topic);
    if (row) entries.push(row);
  }

  return entries;
}

/**
 * Carrega TODAS as regras ativas cadastradas em "Treinamento da IA (Regras da
 * Casa)" para um estabelecimento. Diferente de prefetchEstablishmentFaqs, este
 * não filtra por tópicos detectados — devolve a base inteira para ser injetada
 * no prompt em cada turno (a IA deve enxergar sempre a verdade oficial).
 *
 * Aplica um teto de tamanho para não estourar a janela de contexto da OpenAI;
 * quando estoura, mantém os tópicos mais recentemente atualizados primeiro.
 */
function trimFaqsToMaxChars(entries, maxChars = 8000) {
  const trimmed = [];
  let totalChars = 0;
  for (const entry of entries) {
    const piece = `### ${entry.topic}\n${entry.answer}`;
    if (totalChars + piece.length > maxChars && trimmed.length > 0) {
      break;
    }
    trimmed.push(entry);
    totalChars += piece.length + 2;
  }
  return trimmed;
}

async function loadAllActiveFaqsFromDb(pool, establishmentId) {
  let rows = [];
  try {
    const result = await pool.query(
      `SELECT topic, answer, updated_at
         FROM establishment_faq
        WHERE establishment_id = $1
          AND is_active = TRUE
          AND COALESCE(TRIM(answer), '') <> ''
        ORDER BY updated_at DESC NULLS LAST, topic ASC`,
      [establishmentId]
    );
    rows = result.rows || [];
  } catch (error) {
    console.warn('[faqPrefetchService] falha ao carregar base completa:', error.message);
    return [];
  }

  const entries = [];
  for (const row of rows) {
    const topic = String(row.topic || '').trim();
    const answer = String(row.answer || '').trim();
    if (!topic || !answer) continue;
    entries.push({
      topic,
      answer,
      updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
    });
  }
  return entries;
}

async function loadActiveFaqCatalog(pool, establishmentId) {
  const establishment = Number(establishmentId);
  if (!Number.isFinite(establishment) || establishment <= 0 || !pool) return [];

  const now = Date.now();
  const cached = FAQ_ALL_ACTIVE_CACHE.get(establishment);
  if (cached && now - cached.at < FAQ_CACHE_TTL_MS) {
    return cloneFaqEntries(cached.entries);
  }

  const entries = await loadAllActiveFaqsFromDb(pool, establishment);
  FAQ_ALL_ACTIVE_CACHE.set(establishment, { at: now, entries });
  return cloneFaqEntries(entries);
}

async function loadAllActiveFaqsForEstablishment(pool, establishmentId, { maxChars = 8000 } = {}) {
  const entries = await loadActiveFaqCatalog(pool, establishmentId);
  return filterFaqsForCustomerPrompt(trimFaqsToMaxChars(entries, maxChars));
}

function buildDateSearchPatterns(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return [];
  const [y, m, d] = isoDate.split('-');
  const day = String(Number(d));
  const month = String(Number(m));
  return [
    ...new Set([
      `${d}/${m}`,
      `${d}-${m}`,
      `${day}/${month}`,
      `${day}-${month}`,
      `${d}/${m}/${y}`,
      isoDate,
    ]),
  ];
}

/**
 * Busca FAQs customizadas que mencionam a data citada pelo cliente (ex.: 08/07)
 * ou cadastradas na categoria "evento".
 */
async function loadFaqsMatchingDateMention(
  pool,
  establishmentId,
  userText,
  messageHistory = []
) {
  const establishment = Number(establishmentId);
  if (!Number.isFinite(establishment) || establishment <= 0 || !pool) return [];

  const parsed = resolveDateFromConversation(String(userText || ''), messageHistory);
  const patterns = parsed?.ok && parsed.iso ? buildDateSearchPatterns(parsed.iso) : [];
  const entries = [];
  const seenTopics = new Set();

  const pushRow = (row) => {
    const topic = String(row.topic || '').trim();
    const answer = String(row.answer || '').trim();
    if (!topic || !answer || seenTopics.has(topic)) return;
    seenTopics.add(topic);
    entries.push({
      topic,
      answer,
      updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
    });
  };

  if (patterns.length) {
    const orClauses = patterns.map((_, i) => `(topic ILIKE $${i + 2} OR answer ILIKE $${i + 2})`);
    const params = [establishment, ...patterns.map((p) => `%${p}%`)];
    try {
      const result = await pool.query(
        `SELECT topic, answer, updated_at
           FROM establishment_faq
          WHERE establishment_id = $1
            AND is_active = TRUE
            AND COALESCE(TRIM(answer), '') <> ''
            AND (${orClauses.join(' OR ')})
          ORDER BY updated_at DESC NULLS LAST`,
        params
      );
      for (const row of result.rows || []) pushRow(row);
    } catch (error) {
      console.warn('[faqPrefetchService] falha busca FAQ por data:', error.message);
    }
  }

  if (looksLikeEventProgramQuestion(userText)) {
    try {
      const eventResult = await pool.query(
        `SELECT topic, answer, updated_at
           FROM establishment_faq
          WHERE establishment_id = $1
            AND is_active = TRUE
            AND COALESCE(TRIM(answer), '') <> ''
            AND (category = 'evento' OR topic ILIKE '%evento%')
          ORDER BY updated_at DESC NULLS LAST
          LIMIT 8`,
        [establishment]
      );
      for (const row of eventResult.rows || []) pushRow(row);
    } catch (error) {
      console.warn('[faqPrefetchService] falha busca FAQ evento:', error.message);
    }
  }

  const normalized = String(userText || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/\b(vespera|pre[- ]?feriado|feriado)\b/.test(normalized)) {
    try {
      const holidayResult = await pool.query(
        `SELECT topic, answer, updated_at
           FROM establishment_faq
          WHERE establishment_id = $1
            AND is_active = TRUE
            AND COALESCE(TRIM(answer), '') <> ''
            AND (
              category = 'evento'
              OR topic ILIKE '%evento%'
              OR topic ILIKE '%feriado%'
              OR answer ILIKE '%vespera%'
              OR answer ILIKE '%véspera%'
              OR answer ILIKE '%pre%feriado%'
            )
          ORDER BY updated_at DESC NULLS LAST
          LIMIT 6`,
        [establishment]
      );
      for (const row of holidayResult.rows || []) pushRow(row);
    } catch (error) {
      console.warn('[faqPrefetchService] falha busca FAQ feriado:', error.message);
    }
  }

  return entries;
}

function isHighlineFaqContext(options = {}) {
  if (options.highline === true) return true;
  if (options.establishmentId != null && isHighlineEstablishment(options.establishmentId)) {
    return true;
  }
  return /highline/i.test(String(options.establishmentName || ''));
}

/**
 * Detecta tópicos FAQ relevantes para o turno (não carrega a base inteira).
 */
function detectRelevantFaqTopics(userText, messageHistory = [], options = {}) {
  const { funnelActive = false } = options;
  const isHighline = isHighlineFaqContext(options);
  const topics = detectFaqTopicsFromConversation(messageHistory, userText, options);

  if (funnelActive && isHighline) {
    for (const topic of [
      'coleta_dados_progressiva_reserva',
      'reserva_areas_operacional_highline',
      'reserva_grupos_grandes_highline',
      'horario_corte_chegada_reserva',
    ]) {
      if (!topics.includes(topic)) topics.push(topic);
    }
  }

  const texts = [
    String(userText || '').trim(),
    ...(messageHistory || [])
      .filter((m) => m?.role === 'user')
      .map((m) => String(m.content || '').trim())
      .slice(-6),
  ];
  if (isHighline) {
    for (const text of texts) {
      const size = extractPartySizeFromText(text);
      if (Number.isFinite(size) && size >= 16 && !topics.includes('reserva_grupos_grandes_highline')) {
        topics.push('reserva_grupos_grandes_highline');
      }
    }
  }

  return expandFaqTopicSeedAliases([...new Set(topics.filter(Boolean))]);
}

/**
 * Carrega apenas FAQs dos tópicos detectados, com teto de chars/turno.
 * Sem tópicos detectados: não carrega a base inteira (caro e impreciso).
 */
function normalizeFaqNeedle(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const FAQ_QUERY_STOPWORDS = new Set([
  'oi',
  'ola',
  'oie',
  'opa',
  'bom',
  'boa',
  'dia',
  'tarde',
  'noite',
  'pode',
  'podia',
  'me',
  'te',
  'nos',
  'voce',
  'voces',
  'explica',
  'explicar',
  'explique',
  'falar',
  'fala',
  'contar',
  'conta',
  'sobre',
  'qual',
  'quais',
  'como',
  'tem',
  'ter',
  'pra',
  'para',
  'por',
  'com',
  'que',
  'uma',
  'uno',
  'isso',
  'isto',
  'aqui',
  'ai',
  'favor',
]);

function significantFaqTokens(value) {
  return normalizeFaqNeedle(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !FAQ_QUERY_STOPWORDS.has(token));
}

function extractAboutSubjectNeedle(queryText) {
  const query = normalizeFaqNeedle(queryText);
  const match = query.match(/\bsobre\s+(.+)$/);
  return match ? normalizeFaqNeedle(match[1]) : '';
}

function scoreTitleOverlap(topicNeedle, subjectNeedle) {
  if (!topicNeedle || !subjectNeedle) return 0;
  if (topicNeedle === subjectNeedle) return 100;

  const topicTokens = significantFaqTokens(topicNeedle);
  const subjectTokens = significantFaqTokens(subjectNeedle);
  if (!topicTokens.length || !subjectTokens.length) return 0;

  const topicSet = new Set(topicTokens);
  const subjectSet = new Set(subjectTokens);
  if (
    topicSet.size === subjectSet.size &&
    [...subjectSet].every((token) => topicSet.has(token))
  ) {
    return 100;
  }

  const hits = subjectTokens.filter((token) => topicSet.has(token)).length;
  if (!hits) return 0;
  const unionSize = new Set([...topicTokens, ...subjectTokens]).size;
  return Math.round((hits / unionSize) * 90);
}

function collectExactTitleNeedles(queryText) {
  const needles = [];
  const subject = extractAboutSubjectNeedle(queryText);
  if (subject) needles.push(subject);
  const tokens = significantFaqTokens(queryText);
  if (tokens.length === 1) needles.push(tokens[0]);
  return [...new Set(needles.filter(Boolean))];
}

function findExactTitleMatches(catalog, queryText) {
  const needles = collectExactTitleNeedles(queryText);
  if (!needles.length || !catalog?.length) return [];

  const exact = catalog.filter((entry) => {
    const topic = normalizeFaqNeedle(entry?.topic);
    return Boolean(topic) && needles.some((needle) => topic === needle);
  });
  if (exact.length) return exact;

  return catalog.filter((entry) => {
    const topic = normalizeFaqNeedle(entry?.topic);
    if (!topic) return false;
    return needles.some((needle) => scoreTitleOverlap(topic, needle) >= 100);
  });
}

function scoreFaqAgainstText(entry, queryText) {
  const query = normalizeFaqNeedle(queryText);
  const topic = normalizeFaqNeedle(entry?.topic);
  const answer = normalizeFaqNeedle(entry?.answer).slice(0, 400);
  if (!query || !topic) return 0;

  const subject = extractAboutSubjectNeedle(queryText);
  const titleScore = Math.max(scoreTitleOverlap(topic, query), scoreTitleOverlap(topic, subject));
  if (titleScore >= 100) return 100;

  const tokens = significantFaqTokens(subject || query);
  if (!tokens.length) return titleScore;
  const topicTokenSet = new Set(significantFaqTokens(topic));
  const topicHits = tokens.filter((token) => topicTokenSet.has(token)).length;
  const answerHits = tokens.filter((token) => answer.includes(token)).length;
  if (!topicHits && !answerHits && !titleScore) return 0;
  const missingDistinctive = tokens.filter(
    (token) => token.length >= 5 && !topicTokenSet.has(token)
  );
  if (missingDistinctive.length && topicHits < tokens.length) {
    return Math.min(titleScore, 35);
  }
  const unionSize = new Set([...topicTokenSet, ...tokens]).size || 1;
  const overlap = Math.round((topicHits / unionSize) * 90 + (answerHits / tokens.length) * 15);
  return Math.min(99, Math.max(titleScore, overlap));
}

function speechFromEntries(selected) {
  if (!selected.length) return '';
  if (selected.every((entry) => shouldExecuteAsInstruction(entry.answer))) return '';
  return selected
    .filter((entry) => !shouldExecuteAsInstruction(entry.answer))
    .map((entry) => customerFacingFaqText(entry.answer))
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Fichas que respondem esta pergunta.
 * Resposta pronta sai no texto cadastrado. Orientação volta vazia daqui
 * para ser executada, não copiada.
 */
function selectDirectFaqEntries(entries, userText, { focusTopic = '', topicHints = [] } = {}) {
  const list = (entries || []).filter(
    (entry) => entry && !entry.fallback && String(entry.answer || '').trim()
  );
  if (!list.length) return [];

  const focus = normalizeTopicKey(focusTopic);
  if (focus) {
    const pinned = list.find((entry) => normalizeTopicKey(entry.topic) === focus);
    if (pinned) return [pinned];
  }

  const hinted = [];
  const seen = new Set();
  for (const hint of topicHints || []) {
    const key = normalizeTopicKey(hint);
    if (!key || seen.has(key)) continue;
    const match = list.find((entry) => normalizeTopicKey(entry.topic) === key);
    if (!match) continue;
    seen.add(key);
    hinted.push(match);
  }

  const named = hinted.filter((entry) => scoreFaqAgainstText(entry, userText) >= 100);
  if (named.length) return named;
  if (hinted.length === 1) return hinted;

  const ranked = list
    .map((entry) => ({ entry, score: scoreFaqAgainstText(entry, userText) }))
    .sort((a, b) => b.score - a.score);
  const perfect = ranked.filter((item) => item.score >= 100);
  if (perfect.length) return perfect.map((item) => item.entry);
  if (
    ranked[0] &&
    ranked[0].score >= 55 &&
    (ranked.length === 1 || ranked[0].score - (ranked[1]?.score || 0) >= 15)
  ) {
    return [ranked[0].entry];
  }
  if (list.length === 1) return list;
  return [];
}

function verbatimFaqReply(entries, userText, options = {}) {
  return speechFromEntries(selectDirectFaqEntries(entries, userText, options));
}

async function scoreFaqsAgainstUserText(pool, establishmentId, userText, { limit = 8 } = {}) {
  const query = String(userText || '').trim();
  if (query.length < 3 || !pool) return [];
  const all = await loadActiveFaqCatalog(pool, establishmentId);
  return all
    .map((entry) => ({ entry, score: scoreFaqAgainstText(entry, query) }))
    .filter((item) => item.score >= 40)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function loadFaqsMatchingFreeText(pool, establishmentId, userText, { limit = 5 } = {}) {
  const scored = await scoreFaqsAgainstUserText(pool, establishmentId, userText, { limit });
  return scored.map((item) => item.entry);
}

async function loadRelevantFaqsForEstablishment(
  pool,
  establishmentId,
  topicHints = [],
  { maxChars = FAQ_MAX_CHARS_PER_TURN, funnelActive = false, userText = '', extraTopics = [] } = {}
) {
  const establishment = Number(establishmentId);
  if (!Number.isFinite(establishment) || establishment <= 0 || !pool) return [];

  const userQuestion = String(userText || '').trim();
  if (userQuestion) {
    const catalog = await loadActiveFaqCatalog(pool, establishment);
    const exactMatches = findExactTitleMatches(catalog, userQuestion);
    if (exactMatches.length) {
      return filterFaqsForCustomerPrompt(exactMatches);
    }
  }

  const detectedTopics = [
    ...new Set([...(topicHints || []), ...(extraTopics || [])].filter(Boolean)),
  ];
  let topics = detectedTopics;
  if (!topics.length) {
    // Funil de reserva: zero FAQ genérica no prompt (economiza tokens).
    if (funnelActive) return [];
    // Informativo sem match: só o núcleo mínimo, nunca dump da base.
    topics = [...FAQ_CORE_FALLBACK_TOPICS];
  }

  const canonicalEntries = await prefetchEstablishmentFaqs(pool, establishment, topics);
  const scoredMatches =
    !funnelActive && userText
      ? await scoreFaqsAgainstUserText(pool, establishment, userText, { limit: 8 })
      : [];

  const byTopic = new Map();
  const pushEntry = (entry) => {
    if (!entry?.topic || byTopic.has(entry.topic)) return;
    byTopic.set(entry.topic, entry);
  };

  const STRONG_MATCH = 70;
  const bestScore = scoredMatches[0]?.score || 0;
  if (bestScore >= STRONG_MATCH) {
    for (const { entry, score } of scoredMatches) {
      if (score >= STRONG_MATCH) pushEntry(entry);
    }
    const strongTopics = new Set(
      scoredMatches.filter((item) => item.score >= STRONG_MATCH).map((item) => item.entry.topic)
    );
    for (const entry of canonicalEntries) {
      if (strongTopics.has(entry.topic)) pushEntry(entry);
    }
  } else {
    for (const entry of canonicalEntries) pushEntry(entry);
    for (const { entry } of scoredMatches) pushEntry(entry);
  }

  let entries = [...byTopic.values()];

  if (!entries.length) {
    // Com pergunta do cliente, não inventar cover/horário de outro catálogo.
    if (String(userText || '').trim()) return [];
    const fallbackEntries = topics
      .map((topic) => {
        const answer = getDefaultFaqAnswer(topic);
        return answer
          ? {
              topic,
              answer,
              updatedAt: 0,
              fallback: true,
            }
          : null;
      })
      .filter(Boolean);
    return filterFaqsForCustomerPrompt(fallbackEntries);
  }

  const defaultBudget = funnelActive ? FAQ_MAX_CHARS_FUNNEL : FAQ_MAX_CHARS_PER_TURN;
  const budget =
    Number.isFinite(maxChars) && maxChars > 0
      ? Math.min(maxChars, defaultBudget)
      : defaultBudget;
  const topicOrder = new Map(topics.map((t, i) => [t, i]));
  const scoreByTopic = new Map(scoredMatches.map((item) => [item.entry.topic, item.score]));
  entries.sort((a, b) => {
    const sa = scoreByTopic.get(a.topic) || 0;
    const sb = scoreByTopic.get(b.topic) || 0;
    if (sa !== sb) return sb - sa;
    const ai = topicOrder.has(a.topic) ? topicOrder.get(a.topic) : 999;
    const bi = topicOrder.has(b.topic) ? topicOrder.get(b.topic) : 999;
    if (ai !== bi) return ai - bi;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });

  const trimmed = [];
  let totalChars = 0;
  for (const entry of entries) {
    const piece = `### ${entry.topic}\n${entry.answer}`;
    if (totalChars + piece.length > budget && trimmed.length > 0) {
      const remaining = budget - totalChars - 20;
      if (remaining > 80) {
        trimmed.push({
          ...entry,
          answer: `${String(entry.answer).slice(0, remaining)}…`,
        });
      }
      break;
    }
    trimmed.push(entry);
    totalChars += piece.length + 2;
  }

  return filterFaqsForCustomerPrompt(trimmed);
}

function buildFaqKnowledgeBlock(entries = [], establishmentName = '') {
  const customerEntries = filterFaqsForCustomerPrompt(entries);
  if (!customerEntries.length) return '';
  const houseLabel = establishmentName ? ` DA ${establishmentName.toUpperCase()}` : '';
  // Header agressivo de propósito: força a IA a tratar este bloco como o único
  // material com o qual ela foi treinada para atender. Sem isso, o LLM tende
  // a misturar informação "geral" (alucinada) com a base, gerando respostas
  // que parecem corretas mas contradizem a operação real da casa.
  const header = [
    `TREINAMENTO DA IA — REGRAS DA CASA${houseLabel} (fonte oficial — prevalece sobre conhecimento geral):`,
    'Cada ficha é cadastro desta casa. Leia o corpo antes de falar:',
    '- Resposta pronta (fato, preço, horário, endereço, link): entregue esse conteúdo, sem inventar dado e sem mudar número, horário ou link.',
    '- Orientação para você (se pedirem, pergunte, ofereça, não envie, só depois, sempre perguntar): isso não é fala. Execute o próximo passo em prosa, uma pergunta por vez, sem citar a orientação.',
    '- Se misturar os dois, fale os fatos e cumpra a orientação sem recitá-la.',
    'Não acrescente cover, preço, horário ou regra que não esteja na ficha. Não misture catálogo de outra casa.',
    'Priorize o item cujo título mais corresponde à pergunta (acento/plural à parte).',
    'Não troque uma ficha específica por um tópico genérico parecido (ex.: "entrada com bebidas" não é tabela de cover).',
    'Se a base cobrir o assunto, nunca diga que não encontrou nem que vai confirmar com a equipe.',
    'Só se NENHUM item cobrir o tópico: "Boa, deixa eu confirmar com a equipe e te respondo já."',
  ].join('\n');
  const body = customerEntries
    .map((entry) => `### ${entry.topic}\n${entry.answer}`)
    .join('\n\n');
  return `${header}\n\n${body}`;
}

function buildFaqGroundedSystemPrompt({
  faqText,
  establishmentName = '',
  eventProgramOnly = false,
  settings = null,
}) {
  void eventProgramOnly;
  const hasSettings = Boolean(settings && typeof settings === 'object');
  const personaBlock = hasSettings
    ? faqPersonaBuilder.buildPersonaBlock({
        assistantSettings: settings,
        lockedEstablishmentName: establishmentName,
      })
    : `Você é a anfitriã digital${establishmentName ? ` do ${establishmentName}` : ''} no WhatsApp. Tom caloroso e direto. Português do Brasil.`;

  const emojiRule = hasSettings
    ? settings.use_emojis
      ? '- Máximo 1 emoji discreto se couber.'
      : '- Não use emojis.'
    : '- Não invente datas. Máximo 1 emoji discreto se couber.';

  const bulletRule =
    hasSettings && settings.use_bullets
      ? '- Pode usar bullets curtos se organizar melhor a resposta.'
      : '- Responda em até 3 frases curtas, em texto corrido (sem bullets, sem listas).';

  return `${personaBlock}

REGRAS FAQ:
- Use SOMENTE as fichas abaixo, desta casa.
- Se o corpo for resposta pronta, entregue os fatos sem alterar preço, horário, link ou regra.
- Se o corpo for orientação (pergunte, ofereça, não envie, só depois), execute o próximo passo. Não copie a orientação para o cliente.
- Não complete com cover, preço, dia da semana ou regra que não esteja nessa ficha.
- Se um título corresponder à pergunta, obedeça esse item.
- Se a base cobrir o assunto, nunca diga que não encontrou. Se faltar info: "vou confirmar com a equipe e te respondo já".
- Responda a PERGUNTA ATUAL em uma ou duas frases. O histórico recente é só contexto.
${bulletRule}
- Tom WhatsApp: "Boa noite!", "Show", "Fechado". NUNCA "Caro X", "Atenciosamente", assinatura formal.
- Não faça a pergunta de reserva no final. O sistema puxa o próximo passo da reserva depois da sua resposta.
${emojiRule}
- Limite a resposta a no máximo 3 frases curtas, mesmo que a configuração peça respostas maiores.

${faqText}`;
}

async function generateFaqGroundedReply({
  userQuestion,
  faqEntries = [],
  establishmentName = '',
  messageHistory = [],
  eventProgramOnly = false,
  pool = null,
  establishmentId = null,
  settings = null,
}) {
  const question = String(userQuestion || '').trim();
  const {
    shouldPreferDirectFaqReply,
    pickBestFaqEntry,
    formatTrainingReply,
  } = require('./trainingReplyFormatter');
  if (
    shouldPreferDirectFaqReply({
      userText: question,
      faqEntries,
      topicHints: (faqEntries || []).map((entry) => entry.topic),
    })
  ) {
    const best = pickBestFaqEntry(faqEntries, (faqEntries || []).map((entry) => entry.topic));
    if (best?.answer) {
      const formatted = formatTrainingReply({
        answer: best.answer,
        topic: best.topic,
        settings,
        establishmentName,
        userText: question,
        messageHistory,
        options: { appendCta: false, keepCadastro: true },
      });
      if (formatted.text) return formatted.text;
    }
  }

  const faqText = buildFaqKnowledgeBlock(faqEntries, establishmentName);
  if (!faqText || !question) {
    throw new Error('FAQ ou pergunta ausente para resposta fundamentada.');
  }

  const recentContext = (messageHistory || [])
    .slice(-6)
    .map((m) => `${m.role === 'assistant' ? 'Host' : 'Cliente'}: ${m.content}`)
    .join('\n');

  const modelName = getModelForTask('faq');
  const payload = applyOutputLimit(
    {
      model: modelName,
      messages: [
        {
          role: 'system',
          content: buildFaqGroundedSystemPrompt({
            faqText,
            establishmentName,
            eventProgramOnly,
            settings,
          }),
        },
      {
        role: 'user',
        content: recentContext
          ? `Histórico recente (secundário, não substitui a pergunta atual):\n${recentContext}\n\nPergunta atual do cliente: ${question}`
          : question,
      },
      ],
    },
    'conversational'
  );
  if (!/^gpt-5(\b|[-.])/.test(String(modelName).toLowerCase())) {
    payload.temperature = 0.35;
  }

  const completion = await getOpenAI().chat.completions.create(payload);
  await recordOpenAiUsageSafe(pool, {
    path: 'faq_first',
    establishmentId,
    model: modelName,
    usage: completion?.usage,
    requestId: completion?.id ?? null,
  });

  const reply = String(completion?.choices?.[0]?.message?.content || '').trim();
  if (!reply) throw new Error('Resposta FAQ vazia.');
  return reply;
}

function resolveFaqTopicsForTurn(userText, messageHistory = []) {
  return detectFaqTopicsFromConversation(messageHistory, userText);
}

module.exports = {
  prefetchEstablishmentFaqs,
  loadAllActiveFaqsForEstablishment,
  loadRelevantFaqsForEstablishment,
  loadFaqsMatchingDateMention,
  detectRelevantFaqTopics,
  buildFaqKnowledgeBlock,
  buildFaqGroundedSystemPrompt,
  generateFaqGroundedReply,
  verbatimFaqReply,
  selectDirectFaqEntries,
  resolveFaqTopicsForTurn,
  fetchFaqAnswerForTopic,
  invalidateFaqCache,
  loadFaqsMatchingFreeText,
  loadActiveFaqCatalog,
  scoreFaqAgainstText,
  findExactTitleMatches,
};

const OpenAI = require('openai');
const { buildFaqTopicCandidates, getDefaultFaqAnswer } = require('./agentTools');
const {
  detectFaqTopicsFromConversation,
  extractPartySizeFromText,
  looksLikeEventProgramQuestion,
} = require('./faqTopicCanonical');
const { resolveDateFromConversation } = require('../../nlp/dateResolver');
const {
  FAQ_MAX_CHARS_PER_TURN,
  FAQ_CORE_FALLBACK_TOPICS,
  getModelForTask,
  applyOutputLimit,
} = require('./openAiConfig');

let openaiClient = null;

function getOpenAI() {
  if (!openaiClient) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY não definida no ambiente.');
    openaiClient = new OpenAI({ apiKey: key });
  }
  return openaiClient;
}

async function fetchFaqAnswerForTopic(pool, establishmentId, topicHint) {
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
async function loadAllActiveFaqsForEstablishment(pool, establishmentId, { maxChars = 8000 } = {}) {
  const establishment = Number(establishmentId);
  if (!Number.isFinite(establishment) || establishment <= 0 || !pool) return [];

  let rows = [];
  try {
    const result = await pool.query(
      `SELECT topic, answer, updated_at
         FROM establishment_faq
        WHERE establishment_id = $1
          AND is_active = TRUE
          AND COALESCE(TRIM(answer), '') <> ''
        ORDER BY updated_at DESC NULLS LAST, topic ASC`,
      [establishment]
    );
    rows = result.rows || [];
  } catch (error) {
    console.warn('[faqPrefetchService] falha ao carregar base completa:', error.message);
    return [];
  }

  const entries = [];
  let totalChars = 0;
  for (const row of rows) {
    const topic = String(row.topic || '').trim();
    const answer = String(row.answer || '').trim();
    if (!topic || !answer) continue;
    const piece = `### ${topic}\n${answer}`;
    if (totalChars + piece.length > maxChars && entries.length > 0) {
      break;
    }
    entries.push({
      topic,
      answer,
      updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
    });
    totalChars += piece.length + 2;
  }

  return entries;
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

/**
 * Detecta tópicos FAQ relevantes para o turno (não carrega a base inteira).
 */
function detectRelevantFaqTopics(userText, messageHistory = [], options = {}) {
  const { funnelActive = false } = options;
  const topics = detectFaqTopicsFromConversation(messageHistory, userText);

  if (funnelActive) {
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
  for (const text of texts) {
    const size = extractPartySizeFromText(text);
    if (Number.isFinite(size) && size >= 16 && !topics.includes('reserva_grupos_grandes_highline')) {
      topics.push('reserva_grupos_grandes_highline');
    }
  }

  return [...new Set(topics.filter(Boolean))];
}

/**
 * Carrega apenas FAQs dos tópicos detectados, com teto de ~800 tokens/turno.
 */
async function loadRelevantFaqsForEstablishment(
  pool,
  establishmentId,
  topicHints = [],
  { maxChars = FAQ_MAX_CHARS_PER_TURN, funnelActive = false } = {}
) {
  const establishment = Number(establishmentId);
  if (!Number.isFinite(establishment) || establishment <= 0 || !pool) return [];

  let topics = [...new Set((topicHints || []).filter(Boolean))];
  if (!topics.length) {
    topics = [...FAQ_CORE_FALLBACK_TOPICS];
  }

  let entries = await prefetchEstablishmentFaqs(pool, establishment, topics);

  if (!entries.length) {
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
    if (fallbackEntries.length > 0) {
      return fallbackEntries;
    }

    entries = await loadAllActiveFaqsForEstablishment(pool, establishment, {
      maxChars: Math.min(maxChars, 1200),
    });
    return entries;
  }

  const budget = Number.isFinite(maxChars) && maxChars > 0 ? maxChars : FAQ_MAX_CHARS_PER_TURN;
  const topicOrder = new Map(topics.map((t, i) => [t, i]));
  entries.sort((a, b) => {
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

  return trimmed;
}

function buildFaqKnowledgeBlock(entries = [], establishmentName = '') {
  if (!entries.length) return '';
  const houseLabel = establishmentName ? ` DA ${establishmentName.toUpperCase()}` : '';
  // Header agressivo de propósito: força a IA a tratar este bloco como o único
  // material com o qual ela foi treinada para atender. Sem isso, o LLM tende
  // a misturar informação "geral" (alucinada) com a base, gerando respostas
  // que parecem corretas mas contradizem a operação real da casa.
  const header = [
    `TREINAMENTO DA IA — REGRAS DA CASA${houseLabel} (fonte oficial — prevalece sobre conhecimento geral):`,
    'Use só os fatos abaixo. Se não cobrir o tópico: "Boa, deixa eu confirmar com a equipe e te respondo já."',
  ].join('\n');
  const body = entries
    .map((entry) => `### ${entry.topic}\n${entry.answer}`)
    .join('\n\n');
  return `${header}\n\n${body}`;
}

async function generateFaqGroundedReply({
  userQuestion,
  faqEntries = [],
  establishmentName = '',
  messageHistory = [],
  eventProgramOnly = false,
}) {
  const question = String(userQuestion || '').trim();
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
          content: `Você é a anfitriã digital${establishmentName ? ` do ${establishmentName}` : ''} no WhatsApp. Tom caloroso e direto. Português do Brasil.

REGRAS:
- Use SOMENTE a base abaixo. Se faltar info: "vou confirmar com a equipe e te respondo já".
- Responda a PERGUNTA ATUAL. O histórico recente é só contexto; não continue fluxo antigo de reserva se a pergunta atual for operacional.
- Responda em até 3 frases curtas, em texto corrido (sem bullets, sem listas).
- Tom WhatsApp: "Boa noite!", "Show", "Fechado". NUNCA "Caro X", "Atenciosamente", assinatura formal.
${eventProgramOnly ? '- O cliente só perguntou sobre o evento/programação — NÃO ofereça reserva, horário nem link de lista nesta resposta.' : '- Se a dúvida estiver respondida, pode encerrar com UMA pergunta natural sobre reserva.'}
- Não invente datas. Máximo 1 emoji discreto se couber.

${faqText}`,
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
  generateFaqGroundedReply,
  resolveFaqTopicsForTurn,
  fetchFaqAnswerForTopic,
};

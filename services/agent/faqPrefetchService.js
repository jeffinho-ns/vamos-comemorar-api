const OpenAI = require('openai');
const { buildFaqTopicCandidates } = require('./agentTools');
const { detectFaqTopicsFromConversation } = require('./faqTopicCanonical');

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

function buildFaqKnowledgeBlock(entries = [], establishmentName = '') {
  if (!entries.length) return '';
  const houseLabel = establishmentName ? ` da ${establishmentName}` : '';
  const header = [
    `TREINAMENTO DA IA — REGRAS DA CASA${houseLabel.toUpperCase()} (fonte ÚNICA de verdade — você foi treinada nestes fatos):`,
    '- Releia este bloco ANTES de responder qualquer dúvida factual do cliente (horário, valor, aniversário, áreas, bolo, dress code, política da casa).',
    '- NUNCA contradiga, generalize ou invente fora do que está aqui. Se a base não cobrir o tópico, diga "vou confirmar com a equipe" — nunca improvise valores, horários ou regras.',
    '- Cite valores, horários e benefícios EXATAMENTE como estão escritos abaixo. Não resuma "varia por dia" se houver detalhes concretos.',
    '- Estas regras valem inclusive durante o funil de reserva: se o cliente perguntar algo, responda com a base ANTES de seguir coletando dados.',
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

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `Você é o concierge digital${establishmentName ? ` do ${establishmentName}` : ''} no WhatsApp.
Responda em português do Brasil, tom caloroso e claro, sem markdown.
REGRAS OBRIGATÓRIAS:
- Use SOMENTE os fatos da base de conhecimento abaixo. Não invente horários, preços ou benefícios.
- Responda COMPLETAMENTE à pergunta do cliente antes de qualquer convite à reserva.
- Não diga apenas que "há atenção especial" ou "varia por dia" se os fatos específicos estiverem na base.
- Inclua TODOS os horários, valores de entrada e benefícios presentes na base — não resuma demais.
- Só ofereça reserva no final se fizer sentido; nunca invente uma data específica (ex.: 23/05) se o cliente não pediu.
- Evite emojis; use no máximo 1 apenas se o tom for festivo (ex.: aniversário).

${faqText}`,
      },
      {
        role: 'user',
        content: recentContext
          ? `Histórico recente:\n${recentContext}\n\nPergunta atual do cliente: ${question}`
          : question,
      },
    ],
    temperature: 0.35,
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
  buildFaqKnowledgeBlock,
  generateFaqGroundedReply,
  resolveFaqTopicsForTurn,
  fetchFaqAnswerForTopic,
};

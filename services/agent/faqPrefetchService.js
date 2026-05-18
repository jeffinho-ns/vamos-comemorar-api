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

function buildFaqKnowledgeBlock(entries = [], establishmentName = '') {
  if (!entries.length) return '';
  const header = establishmentName
    ? `BASE DE CONHECIMENTO OFICIAL — ${establishmentName} (obrigatório usar estes fatos):`
    : 'BASE DE CONHECIMENTO OFICIAL (obrigatório usar estes fatos):';
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
- Máximo 2 emojis opcionais.

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
  buildFaqKnowledgeBlock,
  generateFaqGroundedReply,
  resolveFaqTopicsForTurn,
  fetchFaqAnswerForTopic,
};

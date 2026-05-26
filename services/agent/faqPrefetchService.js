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
  const houseLabel = establishmentName ? ` DA ${establishmentName.toUpperCase()}` : '';
  // Header agressivo de propósito: força a IA a tratar este bloco como o único
  // material com o qual ela foi treinada para atender. Sem isso, o LLM tende
  // a misturar informação "geral" (alucinada) com a base, gerando respostas
  // que parecem corretas mas contradizem a operação real da casa.
  const header = [
    `TREINAMENTO DA IA — REGRAS DA CASA${houseLabel} (este é o seu MATERIAL DE ESTUDO oficial — a única fonte de verdade sobre esta casa):`,
    '',
    'COMO USAR ESTE BLOCO:',
    '- ESTUDE este bloco ANTES de responder qualquer dúvida factual do cliente (horário, valor, aniversário, áreas, bolo, dress code, pets, política da casa, reservas).',
    '- Esta base PREVALECE sobre o seu conhecimento geral como modelo de linguagem. Se você "lembra" de outro horário/valor/regra do que está cadastrado aqui — ignore sua memória e use a base. Sempre.',
    '- NUNCA contradiga, generalize ou invente fora do que está aqui. Se a base não cobrir o tópico, diga "Boa, deixa eu confirmar isso com a equipe e te respondo já" — nunca improvise valores, horários ou regras.',
    '- Cite valores, horários e benefícios EXATAMENTE como estão escritos abaixo. Não resuma "varia por dia" se houver detalhes concretos cadastrados.',
    '- Estas regras valem inclusive durante o funil de reserva: se o cliente perguntar algo no meio da coleta, responda com a base ANTES de seguir coletando dados.',
    '- Se duas entradas parecerem conflitantes, prefira a mais recente/específica. Na dúvida, peça pra confirmar com a equipe.',
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
    model: process.env.OPENAI_AGENT_MODEL || 'gpt-5.5',
    messages: [
      {
        role: 'system',
        content: `Você é a anfitriã digital${establishmentName ? ` do ${establishmentName}` : ''} no WhatsApp do cliente. Tom: como uma host real respondendo no celular — caloroso, direto e claro. Português do Brasil.

REGRAS OBRIGATÓRIAS:
- Use SOMENTE os fatos da base de conhecimento abaixo. Não invente horários, preços ou benefícios. Se algo não estiver lá, diga "vou confirmar com a equipe e te respondo já".
- Responda COMPLETAMENTE à pergunta do cliente antes de convidar para reserva.
- Não enrole com "há atenção especial" ou "varia por dia" se a base traz fatos específicos: passe os fatos.
- Inclua os horários, valores e benefícios que estão na base, MAS em texto corrido, dentro de frases curtas (1-3 por resposta). NUNCA em forma de lista com bullets ("•", "-"), nem com cabeçalhos negritados, nem com "Horários:\\n...".
  Ex.: em vez de "Horários:\\n• Quarta: 18h-2h\\n• Sexta: 20h-4h", escreva "A casa abre quarta a partir das 18h e sexta das 20h às 4h."
- Tom WhatsApp: "Boa noite!", "Show", "Fechado", "qualquer coisa me chama". NUNCA "Caro X", "Prezado", "Atenciosamente", "Equipe Vamos Comemorar", assinatura, "É com grande satisfação".
- Quando fizer sentido, termine com UMA pergunta natural sobre a reserva ("Quer que eu já reserve pra você?", "Quer fechar uma mesa pra esse dia?"). Mas só se a pergunta original do cliente já estiver completamente respondida — nunca empurre formulário ignorando a dúvida.
- Nunca invente uma data específica (ex.: 23/05) se o cliente não pediu.
- Emojis: quase nunca; no máximo 1 discreto se a vibe pedir (aniversário 🎉).

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

const OpenAI = require('openai');
const {
  getMaxContextMessages,
  getModelForTask,
  applyOutputLimit,
} = require('./openAiConfig');
const { recordOpenAiUsageSafe } = require('./aiUsageRepository');

let openaiClient = null;

function getOpenAI() {
  if (!openaiClient) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY não definida no ambiente.');
    openaiClient = new OpenAI({ apiKey: key });
  }
  return openaiClient;
}

function formatHistoryForSummary(messages = []) {
  return (messages || [])
    .map((m) => {
      const label = m.role === 'assistant' ? 'Host' : 'Cliente';
      return `${label}: ${String(m.content || '').trim()}`;
    })
    .filter((line) => line.length > 8)
    .join('\n');
}

/**
 * Gera resumo compacto do histórico antigo (gpt-5.5) para substituir mensagens
 * que saíram da janela de contexto.
 */
async function summarizeConversationHistory(olderMessages = [], existingSummary = '', { pool = null } = {}) {
  const transcript = formatHistoryForSummary(olderMessages);
  if (!transcript.trim()) {
    return String(existingSummary || '').trim();
  }

  if (!process.env.OPENAI_API_KEY) {
    const lines = transcript.split('\n').slice(-4);
    return [existingSummary, lines.join(' ')].filter(Boolean).join(' | ').slice(0, 600);
  }

  const modelName = getModelForTask('summary');
  const payload = applyOutputLimit(
    {
      model: modelName,
      messages: [
        {
          role: 'system',
          content:
            'Resuma a conversa WhatsApp em até 3 frases curtas em português. Inclua só fatos já confirmados (data, horário, pessoas, nome, dúvidas respondidas). Sem listas.',
        },
        {
          role: 'user',
          content: [
            existingSummary ? `Resumo anterior: ${existingSummary}` : '',
            `Trecho a resumir:\n${transcript.slice(0, 4000)}`,
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ],
    },
    'json'
  );

  try {
    const completion = await getOpenAI().chat.completions.create(payload);
    await recordOpenAiUsageSafe(pool, {
      path: 'history_summary',
      establishmentId: null,
      model: modelName,
      usage: completion?.usage,
      requestId: completion?.id ?? null,
    });
    const summary = String(completion?.choices?.[0]?.message?.content || '').trim();
    return summary || String(existingSummary || '').trim();
  } catch (error) {
    console.warn('[contextWindow] falha ao resumir histórico:', error.message);
    return String(existingSummary || '').trim();
  }
}

/**
 * Aplica janela de contexto + resumo incremental quando o histórico excede o limite.
 */
async function prepareMessageHistoryForTurn(messageHistory = [], contextSummary = '', { pool = null } = {}) {
  const history = Array.isArray(messageHistory) ? messageHistory : [];
  const maxMessages = getMaxContextMessages();

  if (history.length <= maxMessages) {
    return {
      messageHistory: history,
      contextSummary: String(contextSummary || '').trim(),
      summarized: false,
    };
  }

  const older = history.slice(0, history.length - maxMessages);
  const recent = history.slice(-maxMessages);
  const mergedSummary = await summarizeConversationHistory(older, contextSummary, { pool });

  return {
    messageHistory: recent,
    contextSummary: mergedSummary,
    summarized: true,
  };
}

module.exports = {
  prepareMessageHistoryForTurn,
  summarizeConversationHistory,
  formatHistoryForSummary,
  getMaxContextMessages,
};

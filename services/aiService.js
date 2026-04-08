const OpenAI = require('openai');

const systemPrompt = `Você é o Host Digital do Vamos Comemorar — não é um robô frio, é anfitrião de casa noturna/restaurante: acolhedor, animado, educado e genuíno. Use português do Brasil natural e caloroso.

Analise o histórico recente (até 5 mensagens) e a última mensagem do cliente. Devolva APENAS um JSON válido com este formato exato:
{ "intent": string, "params": object, "suggested_reply": string }

Regras de intent (use exatamente uma destas strings):
- "fazer_reserva"
- "ver_disponibilidade"
- "duvida_geral"
- "falar_com_humano"

REGRA OBRIGATÓRIA — defina intent como "falar_com_humano" SEMPRE que houver QUALQUER um destes sinais:
- Frustração, irritação, reclamação forte, tom agressivo ou desconfiança clara.
- Pedido explícito para falar com pessoa humana, atendente, gerente ou "alguém da equipe".
- Mensagem ilegível por gírias muito fechadas, abreviações excessivas ou texto confuso a ponto de você não ter segurança para ajudar sem um humano.
- Cliente dizendo que a resposta anterior não resolveu ou pedindo escalação.

O campo "params" deve ser um objeto com dados úteis que você inferir (datas, horários, número de pessoas, nome do lugar, etc.) — use {} se não houver.

O campo "suggested_reply" deve ser a mensagem que o Host Digital enviaria ao cliente no WhatsApp AGORA, em tom de hospitalidade, curta (1–3 parágrafos curtos no máximo), sem markdown, sem emojis em excesso (no máximo 1–2 se fizer sentido). Se intent for "falar_com_humano", tranquilize o cliente e diga que um humano da equipe vai assumir em instantes — sem prometer prazos irreais.

Evite repetir literalmente frases que você já disse no histórico recente; varie com naturalidade.`;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function buildTranscriptFromHistory(messageHistory) {
  const lines = (messageHistory || []).map((m) => {
    const label = m.role === 'assistant' ? 'Host' : 'Cliente';
    return `${label}: ${m.content}`;
  });
  return lines.join('\n');
}

function shouldForceHumanIntent(lastUserText) {
  if (!lastUserText || typeof lastUserText !== 'string') return false;
  const t = lastUserText
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const explicitHuman =
    /\b(atendente|humano|pessoa real|falar com alguem|falar com alguém|gerente|supervisor|escala|escalar)\b/i.test(
      t
    );
  const frustration =
    /\b(absurdo|ridiculo|ridículo|pessimo|péssimo|horrivel|horrível|indignad|revoltad|não aguento|nao aguento|pelo amor de deus|que saco|estou bravo|estou brava|isso e uma vergonha|isso é uma vergonha)\b/i.test(
      t
    );
  const notUnderstood = /\b(nao entendi|não entendi|nao to entendendo|não to entendendo)\b/i.test(
    t
  );

  return Boolean(explicitHuman || frustration || notUnderstood);
}

function normalizeInterpretation(parsed, lastUserText) {
  const allowed = new Set([
    'fazer_reserva',
    'ver_disponibilidade',
    'duvida_geral',
    'falar_com_humano',
  ]);

  let intent = typeof parsed?.intent === 'string' ? parsed.intent.trim() : 'duvida_geral';
  if (!allowed.has(intent)) {
    intent = 'duvida_geral';
  }

  if (shouldForceHumanIntent(lastUserText)) {
    intent = 'falar_com_humano';
  }

  const params =
    parsed && typeof parsed.params === 'object' && parsed.params !== null && !Array.isArray(parsed.params)
      ? parsed.params
      : {};

  let suggested_reply =
    typeof parsed?.suggested_reply === 'string' ? parsed.suggested_reply.trim() : '';

  if (intent === 'falar_com_humano' && !suggested_reply) {
    suggested_reply =
      'Oi! Percebi que faz sentido um atendente humano te ajudar melhor agora. Só um instante — já chamo alguém da equipe por aqui pra continuar com você, combinado?';
  }

  return { intent, params, suggested_reply };
}

/**
 * @param {object} opts
 * @param {Array<{ role: 'user'|'assistant', content: string }>} opts.messageHistory até 5 mensagens em ordem cronológica (mais antiga → mais recente)
 */
async function interpretMessage(opts) {
  const messageHistory = opts?.messageHistory;
  if (!Array.isArray(messageHistory) || messageHistory.length === 0) {
    throw new Error('messageHistory deve ser um array não vazio.');
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY não definida no ambiente.');
  }

  const trimmed = messageHistory.slice(-5);
  const lastUser = [...trimmed].reverse().find((m) => m.role === 'user');
  const lastUserText = lastUser?.content || '';

  const transcript = buildTranscriptFromHistory(trimmed);

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Histórico recente (do mais antigo ao mais recente, no máximo 5 mensagens):\n${transcript}\n\nConsidere a última mensagem do cliente como a mais recente acima. Retorne o JSON conforme instruído.`,
      },
    ],
    temperature: 0.35,
  });

  const content = completion?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Resposta vazia da OpenAI.');
  }

  const parsed = JSON.parse(content);
  return normalizeInterpretation(parsed, lastUserText);
}

module.exports = {
  interpretMessage,
  shouldForceHumanIntent,
};

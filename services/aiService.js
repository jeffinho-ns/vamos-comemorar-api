const OpenAI = require('openai');
const { PromptBuilder } = require('./promptBuilder/PromptBuilder');
const {
  getToolDefinitions,
  executeToolCall,
  shouldEnableTools,
} = require('./aiTools/toolRunner');

/** Evita crash ao subir o servidor sem OPENAI_API_KEY; a chave só é exigida ao chamar a IA. */
let openaiClient = null;
const promptBuilder = new PromptBuilder();
function getOpenAI() {
  if (!openaiClient) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OPENAI_API_KEY não definida no ambiente.');
    }
    openaiClient = new OpenAI({ apiKey: key });
  }
  return openaiClient;
}

function buildBrainSystemPrompt(context) {
  return promptBuilder.build(context);
}

const confirmationSystemPrompt = `Você é o Host Digital do Vamos Comemorar. O sistema já registrou a reserva com sucesso.
Gere um JSON {"confirmation": "..."} onde "confirmation" é UMA mensagem calorosa, elegante e humana em português do Brasil, confirmando nome, estabelecimento, data, horário, área, quantidade de pessoas e e-mail.
Tom: concierge comercial (acolhedor, claro e confiante), sem exagero promocional.

REGRA OBRIGATÓRIA DE DATA: use exclusivamente o campo reservation.reservation_date (formato interno YYYY-MM-DD) do JSON de entrada. Ao exibir ao cliente, escreva no formato DD-MM-AAA ou por extenso; ao escrever por extenso (ex. "27 de abril de 20XX"), o ano DEVE ser o mesmo da string reservation_date — nunca invente ou troque o ano.

Se NÃO houver lista de convidados (grupos pequenos), inclua ao final um parágrafo breve sobre respeito às políticas da casa (entrada, horários e uso do espaço) de forma elegante, sem ser ríspido.

Se houver lista de convidados, NÃO coloque o link na mensagem — o link será enviado na mensagem seguinte pelo sistema.

Sem markdown. Máximo 1–2 emojis opcionais.`;

function buildTranscriptFromHistory(messageHistory) {
  const lines = (messageHistory || []).map((m) => {
    const label = m.role === 'assistant' ? 'Host' : 'Cliente';
    return `${label}: ${m.content}`;
  });
  return lines.join('\n');
}

function normalizeUserText(lastUserText) {
  if (!lastUserText || typeof lastUserText !== 'string') return '';
  return lastUserText
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Cliente pediu explicitamente pessoa humana (não confundir com "como funciona"). */
function isExplicitHumanRequest(lastUserText) {
  const t = normalizeUserText(lastUserText);
  if (!t) return false;
  return (
    /\b(falar com (um |uma )?(atendente|gerente|humano|pessoa|alguem|alguém)|quero (um |uma )?(atendente|humano|gerente)|me passa (pra|para) (um |uma )?(atendente|gerente)|chama (um |uma )?(atendente|gerente)|operador(a)? humano|atendimento humano)\b/i.test(
      t
    ) ||
    /\b(pessoa real|falar com alguem|falar com alguém)\b/i.test(t)
  );
}

/** Dúvida amigável sobre reserva ou pedido de explicação — a IA deve responder, não escalar. */
function isFriendlyReservationOnboarding(lastUserText) {
  const t = normalizeUserText(lastUserText);
  if (!t) return false;
  const mentionsReserva =
    /\b(reserva|reservar|mesa|aniversario|aniversário|lista|balada|restaurante|comemorar)\b/i.test(t);
  const asksHow =
    /\b(como funciona|me explica|explica como|como (eu )?(faco|faço)|o que preciso|quais dados|passo a passo|primeira vez|duvida|dúvida)\b/i.test(
      t
    );
  const casualGreeting =
    /\b(o+i+|oi|ola|olá|hey|bom dia|boa tarde|boa noite)\b/i.test(t);
  const wantsToStart = /\b(quero|gostaria|daria|posso|queria)\b/i.test(t);

  if (mentionsReserva && asksHow) return true;
  if (mentionsReserva && (casualGreeting || wantsToStart)) return true;
  if (asksHow) return true;
  return false;
}

function shouldForceHumanIntent(lastUserText) {
  const t = normalizeUserText(lastUserText);
  if (!t) return false;
  if (isClarificationQuestion(lastUserText)) return false;

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

function isClarificationQuestion(lastUserText) {
  const t = normalizeUserText(lastUserText);
  if (!t) return false;
  return (
    /\b(qual|quais)\s+(estabelecimento|estabelecimentos|casa|casas|area|areas|ambiente|ambientes|dados|horarios?|horários?)\b/.test(
      t
    ) || /\bque dados\b/.test(t)
  );
}

function isLikelyReservationIntent(lastUserText) {
  const t = normalizeUserText(lastUserText);
  if (!t) return false;
  return /\b(reserva|reservar|mesa|convidados|horario|horário|rooftop|justino|pracinha|highline|aniversario|aniversário)\b/.test(
    t
  );
}

function normalizeInterpretation(parsed, lastUserText) {
  const allowedActions = new Set([
    'COLLECT_DATA',
    'PROCESS_RESERVATION',
    'REFUSE_MINOR',
    'falar_com_humano',
  ]);

  let action =
    typeof parsed?.action === 'string' ? parsed.action.trim() : 'COLLECT_DATA';

  if (!allowedActions.has(action)) {
    if (parsed?.intent === 'falar_com_humano') {
      action = 'falar_com_humano';
    } else {
      action = 'COLLECT_DATA';
    }
  }

  if (shouldForceHumanIntent(lastUserText)) {
    action = 'falar_com_humano';
  }

  const params =
    parsed && typeof parsed.params === 'object' && parsed.params !== null && !Array.isArray(parsed.params)
      ? parsed.params
      : {};

  const missing_fields = Array.isArray(parsed?.missing_fields)
    ? parsed.missing_fields.filter((x) => typeof x === 'string')
    : [];

  /* Modelo às vezes escala em "como funciona?" — corrigir para onboarding */
  if (
    action === 'falar_com_humano' &&
    isFriendlyReservationOnboarding(lastUserText) &&
    !isExplicitHumanRequest(lastUserText) &&
    !shouldForceHumanIntent(lastUserText)
  ) {
    action = 'COLLECT_DATA';
  }

  if (action === 'falar_com_humano' && isClarificationQuestion(lastUserText)) {
    action = 'COLLECT_DATA';
  }

  if (action === 'REFUSE_MINOR' && isLikelyReservationIntent(lastUserText) && !params.data_nascimento) {
    action = 'COLLECT_DATA';
  }

  if (action === 'PROCESS_RESERVATION' && missing_fields.length > 0) {
    action = 'COLLECT_DATA';
  }

  let suggested_reply =
    typeof parsed?.suggested_reply === 'string' ? parsed.suggested_reply.trim() : '';

  if (action === 'falar_com_humano' && !suggested_reply) {
    suggested_reply =
      'Oi! Percebi que faz sentido um atendente humano te ajudar melhor agora. Só um instante — já chamo alguém da equipe por aqui pra continuar com você, combinado?';
  }

  if (
    action === 'COLLECT_DATA' &&
    isFriendlyReservationOnboarding(lastUserText) &&
    (!suggested_reply ||
      /\b(equipe|atendente em breve|membro da nossa equipe|vai te atender em breve)\b/i.test(
        suggested_reply
      ))
  ) {
    suggested_reply =
      'Oi! Que bom que você quer celebrar com a gente. Por aqui eu mesma te ajudo a reservar: é só me passar qual estabelecimento você prefere, a data, o horário, a área, quantas pessoas vêm, seu nome completo, e-mail e data de nascimento (só pra confirmar que é +18). Vamos começar: em qual casa você quer reservar?';
  }

  return { action, params, missing_fields, suggested_reply };
}

/**
 * @param {object} opts
 * @param {Array<{ role: 'user'|'assistant', content: string }>} opts.messageHistory
 * @param {{ establishmentsBlock?: string, areasBlock?: string, lockedEstablishmentId?: number|null, lockedEstablishmentName?: string|null }} [opts.context]
 */
async function interpretMessage(opts) {
  const messageHistory = opts?.messageHistory;
  if (!Array.isArray(messageHistory) || messageHistory.length === 0) {
    throw new Error('messageHistory deve ser um array não vazio.');
  }

  const trimmed = messageHistory.slice(-8);
  const lastUser = [...trimmed].reverse().find((m) => m.role === 'user');
  const lastUserText = lastUser?.content || '';
  const transcript = buildTranscriptFromHistory(trimmed);
  const context = opts?.context || {};
  const pool = opts?.pool || context.pool || null;
  const systemPrompt = buildBrainSystemPrompt(context);
  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Histórico recente:\n${transcript}\n\nRetorne apenas o JSON exigido.`,
    },
  ];

  const toolsEnabled = Boolean(pool) && shouldEnableTools(context);
  const tools = toolsEnabled ? getToolDefinitions() : undefined;

  if (!toolsEnabled) {
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages,
      temperature: 0.3,
    });
    const content = completion?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Resposta vazia da OpenAI.');
    }
    return normalizeInterpretation(JSON.parse(content), lastUserText);
  }

  let completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    tools,
    tool_choice: toolsEnabled ? 'auto' : undefined,
    temperature: 0.3,
  });

  let assistantMessage = completion?.choices?.[0]?.message;
  let guard = 0;
  while (assistantMessage?.tool_calls?.length && pool && guard < 3) {
    messages.push(assistantMessage);
    for (const toolCall of assistantMessage.tool_calls) {
      const toolResult = await executeToolCall(pool, toolCall);
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult),
      });
    }
    completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.3,
    });
    assistantMessage = completion?.choices?.[0]?.message;
    guard += 1;
  }

  if (assistantMessage?.tool_calls?.length) {
    messages.push(assistantMessage);
    completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        ...messages,
        {
          role: 'user',
          content: 'Com base nas tools executadas, responda agora somente com o JSON exigido.',
        },
      ],
      temperature: 0.3,
    });
  } else {
    completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        ...messages,
        assistantMessage,
        {
          role: 'user',
          content: 'Responda agora somente com o JSON exigido.',
        },
      ].filter(Boolean),
      temperature: 0.3,
    });
  }

  const content = completion?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Resposta vazia da OpenAI.');
  }

  const parsed = JSON.parse(content);
  return normalizeInterpretation(parsed, lastUserText);
}

/**
 * Mensagem de confirmação pós-cadastro (sem incluir link de convidados).
 * @param {object} opts
 * @param {object} opts.reservation — linha ou objeto com campos legíveis
 * @param {boolean} opts.hasGuestList
 * @param {boolean} [opts.isBirthday]
 */
async function generateReservationConfirmationMessage(opts) {
  if (!process.env.OPENAI_API_KEY) {
    const r = opts?.reservation || {};
    return `Reserva registrada com sucesso, ${r.client_name || ''}! Te esperamos no ${r.establishment_name || 'estabelecimento'}.`;
  }

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: confirmationSystemPrompt },
      {
        role: 'user',
        content: JSON.stringify({
          reservation: opts.reservation,
          hasGuestList: Boolean(opts.hasGuestList),
          isBirthday: Boolean(opts.isBirthday),
        }),
      },
    ],
    temperature: 0.4,
  });

  const content = completion?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Confirmação vazia da OpenAI.');
  }
  const parsed = JSON.parse(content);
  if (typeof parsed.confirmation === 'string' && parsed.confirmation.trim()) {
    return parsed.confirmation.trim();
  }
  throw new Error('JSON de confirmação inválido.');
}

module.exports = {
  interpretMessage,
  shouldForceHumanIntent,
  isExplicitHumanRequest,
  isFriendlyReservationOnboarding,
  isLikelyReservationIntent,
  generateReservationConfirmationMessage,
};

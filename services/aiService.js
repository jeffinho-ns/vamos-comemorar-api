const OpenAI = require('openai');

/** Evita crash ao subir o servidor sem OPENAI_API_KEY; a chave só é exigida ao chamar a IA. */
let openaiClient = null;
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
  const establishmentsBlock =
    context?.establishmentsBlock || '(carregue estabelecimentos no servidor)';
  const areasBlock = context?.areasBlock || '(carregue áreas no servidor)';

  return `Você é o Host Digital do Vamos Comemorar — anfitrião de restaurantes e casas noturnas: acolhedor, elegante e caloroso. Use português do Brasil.

Sua tarefa é conduzir reservas pelo WhatsApp com tom de hospitalidade. Celebre com carinho quando o cliente mencionar aniversário ou comemoração.

Colete educadamente TODOS estes dados antes de concluir:
- Estabelecimento (use um dos IDs listados abaixo em establishment_id)
- Nome completo do titular da reserva
- E-mail
- Data de nascimento (YYYY-MM-DD), para confirmar maioridade (+18) na casa
- Quantidade de convidados (número inteiro)
- Data da reserva (YYYY-MM-DD)
- Horário (HH:mm)
- Área preferida (use um dos IDs listados em area_id)

ESTABELECIMENTOS (use establishment_id exato):
${establishmentsBlock}

ÁREAS (use area_id exato quando possível; se o cliente descrever a área, escolha o id mais adequado):
${areasBlock}

REGRAS DE SAÍDA — responda APENAS um JSON válido (sem markdown) neste formato:
{
  "action": string,
  "params": object,
  "missing_fields": string[],
  "suggested_reply": string
}

Valores permitidos para "action":
- "COLLECT_DATA": ainda faltam dados obrigatórios ou há ambiguidade; "missing_fields" deve listar chaves faltando (ex.: "client_email", "reservation_time").
- "PROCESS_RESERVATION": todos os dados obrigatórios estão claros e consistentes. Preencha "params" completo.
- "REFUSE_MINOR": o cliente informou ou ficou evidente que é menor de 18 anos; seja gentil e explique que não é possível concluir a reserva.
- "falar_com_humano": escalação para atendente (frustração, pedido explícito, ou caso que exija humano).

O objeto "params" quando aplicável deve incluir:
{
  "establishment_id": number | null,
  "establishment_name_hint": string | null,
  "client_name": string | null,
  "client_email": string | null,
  "data_nascimento": "YYYY-MM-DD" | null,
  "quantidade_convidados": number | null,
  "reservation_date": "YYYY-MM-DD" | null,
  "reservation_time": "HH:mm" | null,
  "area_id": number | null,
  "area_name_hint": string | null,
  "is_birthday": boolean
}

Quando action for "PROCESS_RESERVATION", todos os campos acima (exceto hints) devem estar preenchidos com valores válidos. Não invente datas ou horários não ditos pelo cliente.

"suggested_reply" é sempre a mensagem que o Host enviaria AGORA no WhatsApp: curta (1–3 parágrafos), sem markdown, no máximo 1–2 emojis se fizer sentido.

Se action for "COLLECT_DATA", faça UMA pergunta ou pedido claro por vez ou um resumo cordial do que falta.

Se action for "PROCESS_RESERVATION", "suggested_reply" pode ser um resumo do que será registrado (o sistema confirmará após salvar).`;
}

const confirmationSystemPrompt = `Você é o Host Digital do Vamos Comemorar. O sistema já registrou a reserva com sucesso.
Gere um JSON {"confirmation": "..."} onde "confirmation" é UMA mensagem calorosa em português do Brasil confirmando nome, estabelecimento, data, horário, área, quantidade de pessoas e e-mail.

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

  let suggested_reply =
    typeof parsed?.suggested_reply === 'string' ? parsed.suggested_reply.trim() : '';

  if (action === 'falar_com_humano' && !suggested_reply) {
    suggested_reply =
      'Oi! Percebi que faz sentido um atendente humano te ajudar melhor agora. Só um instante — já chamo alguém da equipe por aqui pra continuar com você, combinado?';
  }

  return { action, params, missing_fields, suggested_reply };
}

/**
 * @param {object} opts
 * @param {Array<{ role: 'user'|'assistant', content: string }>} opts.messageHistory
 * @param {{ establishmentsBlock?: string, areasBlock?: string }} [opts.context]
 */
async function interpretMessage(opts) {
  const messageHistory = opts?.messageHistory;
  if (!Array.isArray(messageHistory) || messageHistory.length === 0) {
    throw new Error('messageHistory deve ser um array não vazio.');
  }

  const trimmed = messageHistory.slice(-12);
  const lastUser = [...trimmed].reverse().find((m) => m.role === 'user');
  const lastUserText = lastUser?.content || '';

  const transcript = buildTranscriptFromHistory(trimmed);
  const context = opts?.context || {};

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildBrainSystemPrompt(context) },
      {
        role: 'user',
        content: `Histórico recente (do mais antigo ao mais recente):\n${transcript}\n\nConsidere a última mensagem do cliente como a mais recente. Retorne apenas o JSON exigido.`,
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
  generateReservationConfirmationMessage,
};

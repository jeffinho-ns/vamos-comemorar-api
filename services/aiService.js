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
  const lockedEstablishmentId = Number(context?.lockedEstablishmentId);
  const hasLockedEstablishment =
    Number.isFinite(lockedEstablishmentId) && lockedEstablishmentId > 0;
  const lockedEstablishmentName = context?.lockedEstablishmentName
    ? String(context.lockedEstablishmentName).trim()
    : '';
  const lockedEstablishmentRule = hasLockedEstablishment
    ? `\nCONTEXTO FIXO DA CONVERSA:\n- Esta conversa já está vinculada ao estabelecimento ID ${lockedEstablishmentId}${lockedEstablishmentName ? ` (${lockedEstablishmentName})` : ''}.\n- NÃO pergunte ao cliente qual estabelecimento deseja.\n- Em qualquer ação, preencha params.establishment_id = ${lockedEstablishmentId}.\n- Se vier establishment_name_hint, mantenha coerente com o ID acima.`
    : '';
  const establishmentRulesBlock =
    context?.establishmentRulesBlock || '(sem regras operacionais carregadas)';
  const dateOverridesBlock =
    context?.dateOverridesBlock || '(sem exceções de data carregadas)';

  return `Você é a Host Digital do Agilizaiapp responsável por cadastrar novas reservas nos estabelecimentos. Use português do Brasil.

Sua tarefa é conduzir reservas pelo WhatsApp com tom de hospitalidade. Celebre com carinho quando o cliente mencionar aniversário ou comemoração.

Datas: use America/Sao_Paulo como referência. O cliente pode informar datas em DD-MM-AAA (ou DD/MM, ou "dia X"). Sempre interprete para frente no calendário (nunca passado): se a data já passou no mês atual, considere a próxima ocorrência futura. Internamente, converta e preencha reservation_date em YYYY-MM-DD coerente com o combinado.

Colete educadamente TODOS estes dados antes de concluir:
- Estabelecimento (use um dos IDs listados abaixo em establishment_id)
- Nome completo do titular da reserva
- E-mail
- Data de nascimento (DD-MM-AAA), para confirmar maioridade (+18) na casa (internamente converter para YYYY-MM-DD)
- Quantidade de convidados (número inteiro)
- Data da reserva (DD-MM-AAA)
- Horário (HH:mm)
- Área preferida (use um dos IDs listados em area_id)

ESTABELECIMENTOS (use establishment_id exato):
${establishmentsBlock}

IDs canônicos operacionais (priorize estes quando houver dúvida de IDs duplicados):
- Seu Justino: 1
- Pracinha do Seu Justino: 8
- Reserva Rooftop: 9
- Highline: use o ID canônico configurado no sistema

ÁREAS (use area_id exato quando possível; se o cliente descrever a área, escolha o id mais adequado):
${areasBlock}
${lockedEstablishmentRule}

REGRAS OPERACIONAIS CADASTRADAS NO ADMIN (/admin/restaurant-reservations):
${establishmentRulesBlock}

EXCEÇÕES DE DATA CADASTRADAS NO ADMIN (date_overrides):
${dateOverridesBlock}

PRIORIDADE DE FONTE:
- Para horários e disponibilidade por dia da semana, priorize essas regras operacionais cadastradas no admin.
- Para perguntas sobre data específica (feriado, evento, "dia X"), verifique primeiro as EXCEÇÕES DE DATA e responda explicitamente no texto.
- Se existir exceção da data (fechado ou horário especial), cite isso de forma clara na suggested_reply.
- Se não houver regra cadastrada para uma casa/dia, sinalize que precisa confirmar o detalhe e siga coletando dados para reserva.

BASE DE CONHECIMENTO (usar em respostas de FAQ e para vender reserva):
- Cardápios:
  - Highline: https://www.agilizaiapp.com.br/cardapio/highline
  - Oh Fregues: https://www.agilizaiapp.com.br/cardapio/ohfregues
  - Pracinha do Seu Justino: https://www.agilizaiapp.com.br/cardapio/pracinha
  - Reserva Rooftop: https://www.agilizaiapp.com.br/cardapio/reserva-rooftop
  - Seu Justino: https://www.agilizaiapp.com.br/cardapio/justino
- Comanda individual: sim, usamos comanda individual.
- Pode levar bolo: sim, até 2kg e com nota fiscal.
- Pode levar salgadinhos: não é permitido.

ESTILO DE LINGUAGEM (IMPORTANTE):
- Evite tom robótico de chatbot. Soe humana(o), direta(o), simpática(o) e comercial.
- Respostas curtas: normalmente 1 a 4 linhas.
- Público de balada: linguagem leve e um pouco informal (sem exagerar gíria).
- Sempre que fizer sentido, termine com CTA para reserva.

TOM POR ESTABELECIMENTO:
- Reserva Rooftop (id 9): tom mais formal, elegante e consultivo.
- Highline (id 7), Pracinha do Seu Justino (id 8), Seu Justino (id 1): tom mais descontraído, próximo e jovem.
- Oh Fregues (id 4): tom equilibrado, cordial e leve.
- Se não souber a casa ainda, use tom neutro amigável.

GUIA DE FAQ (responder de forma natural, variando texto; evitar resposta engessada):
- "Tem cardápio?"
  -> informe o link da casa e convide para reserva.
- "Qual estilo de música para um dia/semana?"
  -> explique que a programação varia por dia/evento, ofereça validar a data desejada e já encaminhar reserva.
- "Quais horários disponíveis?" / "Que horas abre tal dia?"
  -> se já tiver casa + data, MOSTRE os horários disponíveis primeiro; depois convide para escolher horário e fechar reserva.
- "Tem estacionamento?"
  -> informe que pode variar por casa/dia/evento e ofereça confirmar no atendimento humano, sem travar a conversa.
- "Comanda individual?"
  -> confirmar que sim.
- "Posso levar bolo?"
  -> confirmar que sim, até 2kg com nota fiscal.
- "Pode levar salgadinhos?"
  -> informar que não é permitido.

FAQ SUGERIDO POR CASA (MODELOS DE RESPOSTA CURTA + CTA; varie a redação):

1) HIGHLINE (id 7) — TOM DESCONTRAÍDO
- "Tem cardápio?"
  -> "Tem sim! Aqui está o cardápio: https://www.agilizaiapp.com.br/cardapio/highline. Se quiser, já te ajudo a reservar no melhor horário."
- "Qual o estilo da casa?"
  -> "O Highline tem vibe animada e programação que varia por dia. Me fala o dia que você quer ir que te passo a melhor opção."
- "Que horas abre?"
  -> "Depende do dia e da programação. Me manda a data que você quer e eu te passo certinho com opção de reserva."
- "Tem comanda individual?"
  -> "Temos sim, comanda individual."
- "Posso levar bolo?"
  -> "Pode sim, até 2kg e com nota fiscal."
- "Pode levar salgadinho?"
  -> "Salgadinho de fora não é permitido."

2) PRACINHA DO SEU JUSTINO (id 8) — TOM DESCONTRAÍDO
- "Tem cardápio?"
  -> "Tem sim! https://www.agilizaiapp.com.br/cardapio/pracinha. Se quiser, já deixo sua reserva encaminhada."
- "Quero reservar pra turma grande"
  -> "Fechou! Na Pracinha dá pra reservar até 60 pessoas; só te alinhando: lugares sentados garantidos são até 6. Me passa data/horário/qtde que eu organizo pra você."
- "Todo mundo fica sentado?"
  -> "Na Pracinha garantimos até 6 assentos na reserva. Acima disso, o restante fica no fluxo da casa."
- "Que horas abre tal dia?"
  -> "Varia por dia. Me fala a data que eu confirmo certinho e já vejo disponibilidade."
- "Tem estacionamento?"
  -> "Pode variar por dia e operação da casa. Se quiser, já abro sua reserva e confirmo isso pra você também."
- "Comanda individual?"
  -> "Sim, usamos comanda individual."

3) SEU JUSTINO (id 1) — TOM DESCONTRAÍDO
- "Tem cardápio?"
  -> "Tem sim! https://www.agilizaiapp.com.br/cardapio/justino. Quer que eu já te ajude com a reserva?"
- "Rola aniversário?"
  -> "Rola sim! Me passa data, horário e quantidade que já te mostro a melhor forma de reservar."
- "Qual música toca?"
  -> "A programação muda por dia/evento. Se você me falar a data, eu te direciono melhor."
- "Que horas abre?"
  -> "Depende do dia. Me manda a data que eu te passo o horário certinho."
- "Posso levar bolo?"
  -> "Pode sim: até 2kg e com nota fiscal."
- "Pode levar salgadinhos?"
  -> "Salgadinhos de fora não são permitidos."

4) RESERVA ROOFTOP (id 9) — TOM MAIS FORMAL
- "Tem cardápio?"
  -> "Sim, claro. Cardápio: https://www.agilizaiapp.com.br/cardapio/reserva-rooftop. Se desejar, posso verificar a melhor janela para sua reserva."
- "Qual estilo musical?"
  -> "A programação musical varia conforme o dia e o evento. Se me informar a data desejada, verifico a referência mais adequada para sua experiência."
- "Quais horários disponíveis?"
  -> "Os horários variam por dia e disponibilidade de área. Informe data, horário pretendido e número de pessoas para eu validar as melhores opções."
- "Tem estacionamento?"
  -> "A disponibilidade pode variar conforme operação e evento do dia. Posso confirmar esse ponto para você durante o atendimento da reserva."
- "Comanda individual?"
  -> "Sim, trabalhamos com comanda individual."
- "Posso levar bolo?"
  -> "Sim, é permitido bolo de até 2kg, com apresentação de nota fiscal."

5) OH FREGUES (id 4) — TOM CORDIAL E LEVE
- "Tem cardápio?"
  -> "Tem sim! https://www.agilizaiapp.com.br/cardapio/ohfregues. Se quiser, já te ajudo com a reserva."
- "Qual o horário?"
  -> "Varia por dia. Me diz a data que você quer e eu te passo certinho."
- "Comanda individual?"
  -> "Sim, usamos comanda individual."
- "Posso levar bolo?"
  -> "Pode sim: até 2kg com nota fiscal."

REGRAS PARA USAR ESSES MODELOS:
- Não copiar sempre igual; variar a forma de falar.
- Evitar texto longo; manter objetivo.
- Priorizar resposta útil + pergunta de avanço para reserva.
- Se a casa não estiver clara, pedir confirmação da casa primeiro.

REGRA COMERCIAL ESPECIAL — PRACINHA DO SEU JUSTINO (ID 8):
- Reserva com lugares sentados garantidos: até 6 pessoas sentadas.
- Grupos grandes: permitido reservar até 60 pessoas totais.
- Para grupos acima de 6 na Pracinha, explique de forma transparente:
  - somente 6 lugares sentados garantidos;
  - o restante do grupo fica em formato de apoio/fluxo da casa.
- Nunca diga que todos ficarão sentados quando quantidade_convidados > 6 na Pracinha.

REGRAS DE FAQ (quando cliente perguntar):
- "Tem cardápio?": envie o link exato da casa e convide para reservar.
- "Qual estilo de música?": informe que a programação varia por dia/semana e convide a dizer data para validar a melhor experiência.
- "Quais horários disponíveis?" / "Que horas abre tal dia?": informe que varia por casa e dia; peça casa + data + horário desejado e conduza para reserva.
- "Tem estacionamento?": informe que pode variar por casa e dia/evento; ofereça confirmar no atendimento humano após iniciar a reserva.
- Sempre que possível, terminar com CTA de conversão (ex.: "Me passa data, horário e quantidade que já deixo sua reserva encaminhada.").

CENÁRIOS ESPECIAIS (resposta inteligente sem perder venda):
- Cliente mal educado/impaciente:
  - mantenha calma, não confronte e não ironize;
  - reconheça brevemente ("entendo", "vamos resolver");
  - conduza com objetividade para o próximo passo da reserva.
- Cliente com ofensa leve + ainda quer reservar:
  - não escale automaticamente para humano;
  - responda profissionalmente e peça os dados mínimos para avançar.
- Cliente pede assunto fora do escopo (clima, política, tema aleatório):
  - responda curto, redirecione para reservas de forma natural.
- Cliente compara casas ("qual é melhor?"):
  - responda com perfil resumido de cada opção e feche com pergunta de decisão (data/casa/horário).
- Cliente sem clareza ("quero algo bom"):
  - faça uma pergunta de qualificação por vez (casa ou data ou quantidade), sempre conduzindo para fechar reserva.
- Em conflito de regra:
  - prevalece regra operacional cadastrada no admin e exceção de data.

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
- "falar_com_humano": APENAS quando houver frustração clara, insultos, pedido explícito de falar com pessoa/gerente/atendente, ou impossibilidade real de ajudar com dados do sistema.
- NUNCA use "falar_com_humano" para: primeira mensagem, "como funciona?", "me explica", dúvidas sobre o processo de reserva, ou curiosidade antes de informar dados — nesses casos use "COLLECT_DATA", explique o passo a passo com carinho em "suggested_reply" e pergunte pelo primeiro dado (ex.: qual estabelecimento).

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
Se QUALQUER dado obrigatório estiver ausente ou incerto, use "COLLECT_DATA" — nunca "PROCESS_RESERVATION" pela metade.

PROIBIDO em "suggested_reply" até o sistema confirmar o salvamento: dizer que a reserva "está pronta", "quase pronta", "confirmada", "já está registrada" ou "garantida" no sistema. Enquanto faltarem dados, diga claramente que ainda falta informação para registrar.
Em "COLLECT_DATA", use tom animado, mas deixe explícito que a reserva só entra no sistema depois que todos os dados forem enviados e confirmados.

"suggested_reply" é sempre a mensagem que o Host enviaria AGORA no WhatsApp: curta (1–3 parágrafos), sem markdown, no máximo 1–2 emojis se fizer sentido.

Se action for "COLLECT_DATA", faça UMA pergunta ou pedido claro por vez ou um resumo cordial do que falta.

Se action for "PROCESS_RESERVATION" com params completos, "suggested_reply" pode ser um resumo breve do que será registrado (ex.: "Perfeito — vou registrar agora com estes dados…") — nunca como se já tivesse sido salvo.`;
}

const confirmationSystemPrompt = `Você é o Host Digital do Vamos Comemorar. O sistema já registrou a reserva com sucesso.
Gere um JSON {"confirmation": "..."} onde "confirmation" é UMA mensagem calorosa em português do Brasil confirmando nome, estabelecimento, data, horário, área, quantidade de pessoas e e-mail.

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

  /* Modelo às vezes escala em "como funciona?" — corrigir para onboarding */
  if (
    action === 'falar_com_humano' &&
    isFriendlyReservationOnboarding(lastUserText) &&
    !isExplicitHumanRequest(lastUserText) &&
    !shouldForceHumanIntent(lastUserText)
  ) {
    action = 'COLLECT_DATA';
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
  isExplicitHumanRequest,
  isFriendlyReservationOnboarding,
  generateReservationConfirmationMessage,
};

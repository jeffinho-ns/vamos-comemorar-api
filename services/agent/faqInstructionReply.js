'use strict';

const {
  analyzeFaqAnswer,
  fallbackInstructionReply,
  replyLeaksInstruction,
} = require('./faqAnswerRole');
const { getModelForTask, applyOutputLimit } = require('./openAiConfig');
const { recordOpenAiUsageSafe } = require('./aiUsageRepository');

function runningUnderNodeTest() {
  return process.execArgv.includes('--test') || process.argv.includes('--test');
}

function modelAllowed() {
  if (runningUnderNodeTest()) return false;
  if (String(process.env.FAQ_INSTRUCTION_MODEL || '').trim() === '0') return false;
  return Boolean(String(process.env.OPENAI_API_KEY || '').trim());
}

function buildInstructionPrompt(establishmentName, cards) {
  const house = establishmentName ? ` do ${establishmentName}` : '';
  const body = cards
    .map((card) => {
      const analyzed = analyzeFaqAnswer(card.answer);
      const title = card.topic ? `Ficha: ${card.topic}` : 'Ficha';
      return `${title}\n${analyzed.cleaned}`;
    })
    .join('\n\n');

  return `Você é a anfitriã no WhatsApp${house}. Tom humano, curto, uma pergunta por vez.

A ficha abaixo pode ser resposta pronta ou orientação para você.
- Resposta pronta (fato, preço, horário, endereço, link): use esses dados, sem inventar e sem alterar número, horário ou link.
- Orientação (se pedirem, pergunte, ofereça, não envie, só depois, sempre perguntar): isso NÃO é fala do cliente. Execute só o próximo passo. Não copie a orientação, não diga "a ficha diz" e não use lista.
- Se a orientação manda perguntar antes de agir, pergunte só isso agora.
- Se o cliente já respondeu esse passo no histórico, avance para o próximo. Não repita a mesma pergunta.
- No cancelamento: peça o motivo, depois confirme se quer cancelar ou remarcar. Quando o cliente confirmar que quer cancelar, avise que vai chamar uma pessoa da equipe para mostrar o procedimento. Não peça de novo.
- Não invente link, preço, horário ou benefício que não esteja na ficha.

${body}`;
}

async function generateInstructionReply({
  cards,
  userText,
  history = [],
  establishmentName = '',
  pool = null,
  establishmentId = null,
}) {
  const OpenAI = require('openai');
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) throw new Error('OPENAI_API_KEY não definida.');

  const recent = (history || [])
    .slice(-6)
    .map((item) => `${item.role === 'assistant' ? 'Host' : 'Cliente'}: ${item.content}`)
    .join('\n');
  const question = String(userText || '').trim();
  const modelName = getModelForTask('instruction');
  const payload = applyOutputLimit(
    {
      model: modelName,
      messages: [
        { role: 'system', content: buildInstructionPrompt(establishmentName, cards) },
        {
          role: 'user',
          content: recent
            ? `Histórico recente:\n${recent}\n\nMensagem atual do cliente: ${question}`
            : question,
        },
      ],
    },
    'conversational'
  );
  if (!/^gpt-[56](\b|[-.])/i.test(String(modelName))) {
    payload.temperature = 0.4;
  }

  const client = new OpenAI({ apiKey: key });
  const completion = await client.chat.completions.create(payload);
  await recordOpenAiUsageSafe(pool, {
    path: 'faq_instruction',
    establishmentId,
    model: modelName,
    usage: completion?.usage,
    requestId: completion?.id ?? null,
  });
  const reply = String(completion?.choices?.[0]?.message?.content || '').trim();
  if (!reply) throw new Error('Resposta de orientação vazia.');
  return reply;
}

async function executeFaqInstruction({
  cards,
  userText,
  history = [],
  establishmentName = '',
  pool = null,
  establishmentId = null,
}) {
  const list = (cards || []).filter((card) => String(card?.answer || '').trim());
  const joined = list.map((card) => card.answer).join('\n');
  if (!list.length) {
    return { text: '', usedModel: false };
  }

  const cancelScript = /cancel/i.test(joined) && /pergunte o motivo/i.test(joined);
  if (cancelScript) {
    return {
      text: fallbackInstructionReply(joined, userText, history),
      usedModel: false,
    };
  }

  if (modelAllowed()) {
    try {
      const generated = await generateInstructionReply({
        cards: list,
        userText,
        history,
        establishmentName,
        pool,
        establishmentId,
      });
      const leaks = list.some((card) => replyLeaksInstruction(generated, card.answer));
      if (generated && !leaks) {
        return { text: generated, usedModel: true };
      }
    } catch (error) {
      console.warn('[faqInstructionReply] modelo indisponível:', error.message);
    }
  }

  return {
    text: fallbackInstructionReply(joined, userText, history),
    usedModel: false,
  };
}

module.exports = {
  executeFaqInstruction,
  buildInstructionPrompt,
  modelAllowed,
};

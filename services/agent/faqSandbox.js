'use strict';

const { isInformationalFaqTurn } = require('./faqTopicCanonical');
const {
  detectRelevantFaqTopics,
  invalidateFaqCache,
  loadRelevantFaqsForEstablishment,
  verbatimFaqReply,
} = require('./faqPrefetchService');
const CONFIRM_LATER = /confirmar com a equipe/i;

function formatSandboxDate(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || '').trim());
  if (!match) return '';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatSandboxTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return '';
  return `${match[1]}:${match[2]}`;
}

function buildSandboxQuestion(message, simulatedDate, simulatedTime) {
  const question = String(message || '').trim();
  if (!question) return '';
  const dateLabel = formatSandboxDate(simulatedDate);
  const timeLabel = formatSandboxTime(simulatedTime) || (dateLabel ? '12:00' : '');
  if (!dateLabel && !formatSandboxTime(simulatedTime)) return question;
  if (dateLabel && timeLabel) return `Hoje é ${dateLabel}, agora são ${timeLabel}. ${question}`;
  return `Agora são ${timeLabel}. ${question}`;
}

function summarizeFaqRead(entries, focusTopic) {
  const sources = (entries || [])
    .filter((entry) => entry && !entry.fallback && entry.topic)
    .map((entry) => String(entry.topic));
  const focus = String(focusTopic || '').trim();
  return {
    sources,
    readFocus: !focus || sources.includes(focus),
  };
}

async function loadActiveFaqByTopic(pool, establishmentId, topic) {
  const result = await pool.query(
    `SELECT topic, answer, updated_at
       FROM establishment_faq
      WHERE establishment_id = $1
        AND topic = $2
        AND is_active = TRUE
        AND COALESCE(TRIM(answer), '') <> ''
      LIMIT 1`,
    [establishmentId, topic],
  );
  const row = result.rows[0];
  if (!row?.answer) return null;
  return {
    topic: String(row.topic),
    answer: String(row.answer).trim(),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
  };
}

function pinFocusedFaq(entries, focused) {
  if (!focused) return entries;
  return [focused, ...(entries || []).filter((entry) => entry.topic !== focused.topic)];
}

/**
 * Responde com o texto cadastrado da casa, sem WhatsApp e sem criar reserva.
 */
async function runFaqReadTest(pool, input = {}) {
  const establishmentId = Number(input.establishmentId);
  const question = buildSandboxQuestion(input.message, input.simulatedDate, input.simulatedTime);
  const focusTopic = String(input.focusTopic || '').trim();
  const history = (Array.isArray(input.history) ? input.history : [])
    .slice(-6)
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: String(item?.content || '').trim().slice(0, 800),
    }))
    .filter((item) => item.content);

  if (!Number.isFinite(establishmentId) || establishmentId <= 0) {
    throw new Error('Estabelecimento inválido.');
  }
  if (!question) {
    throw new Error('Digite uma pergunta como se fosse o cliente.');
  }

  invalidateFaqCache(establishmentId);
  const informational = isInformationalFaqTurn(question);
  const topicHints = detectRelevantFaqTopics(question, history, {
    establishmentId,
    funnelActive: false,
  });
  const loaded = await loadRelevantFaqsForEstablishment(pool, establishmentId, topicHints, {
    funnelActive: false,
    userText: question,
    extraTopics: focusTopic ? [focusTopic] : [],
  });
  const focused = focusTopic ? await loadActiveFaqByTopic(pool, establishmentId, focusTopic) : null;
  const entries = pinFocusedFaq(loaded, focused);
  const reading = summarizeFaqRead(entries, focusTopic);
  const grounded = focused ? [focused] : entries.filter((entry) => !entry.fallback);

  if (!grounded.length) {
    return {
      reply:
        'Não encontrei essa informação na base desta casa. No WhatsApp a Sol diria que vai confirmar com a equipe.',
      sources: [],
      readFocus: reading.readFocus,
      informational,
      usedModel: false,
      verbatim: false,
    };
  }

  const reply = verbatimFaqReply(grounded, question, { focusTopic, topicHints });
  if (!reply) {
    return {
      reply:
        'Não encontrei essa informação na base desta casa. No WhatsApp a Sol diria que vai confirmar com a equipe.',
      sources: reading.sources,
      readFocus: false,
      informational,
      usedModel: false,
    };
  }

  return {
    reply,
    sources: reading.sources,
    readFocus: reading.readFocus && !CONFIRM_LATER.test(reply),
    informational,
    usedModel: false,
    verbatim: true,
  };
}

module.exports = {
  formatSandboxTime,
  buildSandboxQuestion,
  pinFocusedFaq,
  summarizeFaqRead,
  runFaqReadTest,
};

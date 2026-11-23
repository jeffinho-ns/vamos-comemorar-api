'use strict';

const { loadActiveSettings } = require('./assistantSettingsService');
const { isInformationalFaqTurn } = require('./faqTopicCanonical');
const {
  detectRelevantFaqTopics,
  generateFaqGroundedReply,
  invalidateFaqCache,
  loadRelevantFaqsForEstablishment,
} = require('./faqPrefetchService');
const {
  formatTrainingReply,
  pickBestFaqEntry,
  shouldPreferDirectFaqReply,
} = require('./trainingReplyFormatter');

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

async function loadEstablishmentName(pool, establishmentId) {
  const result = await pool.query(`SELECT name FROM places WHERE id = $1 LIMIT 1`, [
    establishmentId,
  ]);
  return String(result.rows[0]?.name || '').trim();
}

/**
 * Responde como o atendimento leria a base, sem WhatsApp e sem criar reserva.
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
  const establishmentName = await loadEstablishmentName(pool, establishmentId);
  const informational = isInformationalFaqTurn(question);
  const topicHints = detectRelevantFaqTopics(question, history, {
    establishmentId,
    establishmentName,
    funnelActive: false,
  });
  const entries = await loadRelevantFaqsForEstablishment(pool, establishmentId, topicHints, {
    funnelActive: false,
    userText: question,
    extraTopics: focusTopic ? [focusTopic] : [],
  });
  const reading = summarizeFaqRead(entries, focusTopic);
  const grounded = entries.filter((entry) => !entry.fallback);

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

  let settings = null;
  try {
    settings = await loadActiveSettings(pool, establishmentId);
  } catch (_error) {
    settings = null;
  }

  if (
    shouldPreferDirectFaqReply({
      userText: question,
      faqEntries: grounded,
      topicHints: focusTopic ? [focusTopic, ...topicHints] : topicHints,
    })
  ) {
    const best = pickBestFaqEntry(grounded, focusTopic ? [focusTopic, ...topicHints] : topicHints);
    const formatted = formatTrainingReply({
      answer: best.answer,
      topic: best.topic,
      settings,
      establishmentName,
      userText: question,
      messageHistory: history,
      options: { appendCta: false, keepCadastro: true },
    });
    if (formatted.text) {
      return {
        reply: formatted.text,
        sources: reading.sources,
        readFocus: reading.readFocus && !CONFIRM_LATER.test(formatted.text),
        informational,
        usedModel: false,
        verbatim: true,
      };
    }
  }

  const reply = await generateFaqGroundedReply({
    userQuestion: question,
    faqEntries: grounded,
    establishmentName,
    messageHistory: history,
    pool,
    establishmentId,
    settings,
  });

  return {
    reply,
    sources: reading.sources,
    readFocus: reading.readFocus && !CONFIRM_LATER.test(reply),
    informational,
    usedModel: true,
    verbatim: false,
  };
}

module.exports = {
  formatSandboxTime,
  buildSandboxQuestion,
  summarizeFaqRead,
  runFaqReadTest,
};

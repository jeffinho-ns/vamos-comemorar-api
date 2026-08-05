/**
 * Formata respostas diretas de FAQ/Treinamento para WhatsApp sem OpenAI.
 * Aplica Configuração de IA (tom, tamanho, emojis, saudação) sobre o texto FAQ.
 */

const { stripMetaInstructionsFromAnswer, isCustomerFacingFaqEntry } = require('./faqPromptFilter');
const {
  isInformationalFaqTurn,
  looksLikeReservationPushOnly,
  normalizeTopicKey,
} = require('./faqTopicCanonical');
const { looksLikeReservationIntent } = require('./reservationDateHint');

const CURTA_MAX_CHARS = 280;
const LONGA_MAX_CHARS = 900;
const MULTI_STEP_MIN_CHARS = 600;

const GREETING_START_RE = /^(oi|olá|ola|bom dia|boa tarde|boa noite)\b/i;
const HTTP_URL_RE = /https?:\/\/\S+/i;
const EXTERNAL_LINK_LINE_RE = /^-\s*(.+?):\s*(https?:\/\/\S+)/i;
const NUMBERED_STEP_RE = /(?:^|\n)\s*\d+\)\s/;

const MENU_TOPIC_RE = /cardapio|menu|^link$/i;

function collapseBlankLines(text) {
  return String(text || '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanFaqAnswer(answer) {
  return collapseBlankLines(stripMetaInstructionsFromAnswer(answer));
}

function stripEmojis(text) {
  return String(text || '')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[\u{2600}-\u{26FF}]/gu, '')
    .replace(/[\u{2700}-\u{27BF}]/gu, '')
    .replace(/\uFE0F/g, '')
    .replace(/  +/g, ' ')
    .replace(/ +\n/g, '\n')
    .trim();
}

function splitSentences(text) {
  const parts = String(text || '').match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g);
  return parts ? parts.map((part) => part.trim()).filter(Boolean) : [String(text || '').trim()];
}

function truncateAtSentenceBoundary(text, maxChars) {
  const slice = text.slice(0, maxChars);
  const boundaries = ['. ', '! ', '? ', '… ']
    .map((token) => slice.lastIndexOf(token))
    .filter((idx) => idx >= Math.floor(maxChars * 0.45));
  if (!boundaries.length) return `${slice.trim()}…`;
  const cut = Math.max(...boundaries);
  return text.slice(0, cut + 1).trim();
}

function truncateCurta(text) {
  const normalized = String(text || '').trim();
  if (!normalized) return '';

  const sentences = splitSentences(normalized);
  if (sentences.length >= 2) {
    const twoSentences = sentences.slice(0, 2).join(' ').trim();
    if (twoSentences.length <= CURTA_MAX_CHARS) return twoSentences;
    return truncateAtSentenceBoundary(twoSentences, CURTA_MAX_CHARS);
  }

  if (normalized.length <= CURTA_MAX_CHARS) return normalized;
  if (sentences.length >= 1 && sentences[0].length <= CURTA_MAX_CHARS) {
    return sentences[0];
  }

  return truncateAtSentenceBoundary(normalized, CURTA_MAX_CHARS);
}

function truncateLonga(text) {
  const normalized = String(text || '').trim();
  if (normalized.length <= LONGA_MAX_CHARS) return normalized;
  return truncateAtSentenceBoundary(normalized, LONGA_MAX_CHARS);
}

function countUserMessages(messageHistory = []) {
  return (messageHistory || []).filter((msg) => msg?.role === 'user').length;
}

function assistantAlreadyGreeted(messageHistory = []) {
  return (messageHistory || []).some(
    (msg) =>
      msg?.role === 'assistant' &&
      GREETING_START_RE.test(String(msg.content || '').trim())
  );
}

function answerAlreadyGreets(text) {
  return GREETING_START_RE.test(String(text || '').trim());
}

function shouldAddGreeting(settings, messageHistory, answerText) {
  if (!settings?.use_greeting) return false;
  if (!String(settings.assistant_name || '').trim()) return false;
  if (countUserMessages(messageHistory) > 1) return false;
  if (answerAlreadyGreets(answerText)) return false;
  if (!settings.greet_when_already_greeted && assistantAlreadyGreeted(messageHistory)) {
    return false;
  }
  return true;
}

function buildGreetingPrefix(settings) {
  const name = String(settings.assistant_name || '').trim();
  const emoji = settings.use_emojis !== false ? ' 🙂' : '';
  const gender = String(settings.gender || 'feminino').toLowerCase();

  if (gender === 'masculino') {
    return `Oi! Aqui é o ${name}${emoji}\n\n`;
  }
  if (gender === 'neutro') {
    return `Oi! Aqui é ${name}${emoji}\n\n`;
  }
  return `Oi! Aqui é a ${name}${emoji}\n\n`;
}

function topicSuggestsMenuLink(topic) {
  const normalized = normalizeTopicKey(topic);
  return MENU_TOPIC_RE.test(normalized);
}

function parseExternalLinkLines(block) {
  const links = [];
  for (const line of String(block || '').split('\n')) {
    const match = line.match(EXTERNAL_LINK_LINE_RE);
    if (!match) continue;
    links.push({
      title: match[1].trim(),
      url: match[2].replace(/\s*\([^)]*\)\s*$/, '').trim(),
    });
  }
  return links;
}

function normalizeLinkTitle(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function pickRelevantExternalLink(topic, externalLinksBlock) {
  const links = parseExternalLinkLines(externalLinksBlock);
  if (!links.length) return null;

  if (topicSuggestsMenuLink(topic)) {
    const menuLink = links.find((link) => {
      const title = normalizeLinkTitle(link.title);
      return title.includes('cardapio') || title.includes('menu');
    });
    return menuLink || links[0];
  }

  return links[0];
}

function appendRelevantLink(text, topic, externalLinksBlock) {
  if (!topicSuggestsMenuLink(topic)) return { text, appended: false };
  if (HTTP_URL_RE.test(text)) return { text, appended: false };

  const link = pickRelevantExternalLink(topic, externalLinksBlock);
  if (!link?.url) return { text, appended: false };

  const line = `Cardápio: ${link.url}`;
  return {
    text: `${text.trim()}\n\n${line}`,
    appended: true,
  };
}

function applyFormalTone(text, addedGreeting) {
  if (!addedGreeting) return text;
  return String(text || '')
    .replace(/^Show!\s*/i, 'Claro! ')
    .replace(/^Boa!\s*/i, 'Certo! ')
    .replace(/^Show,\s*/i, 'Claro, ');
}

function topicsMatch(entryTopic, hintTopic) {
  return normalizeTopicKey(entryTopic) === normalizeTopicKey(hintTopic);
}

function looksLikeMultiStepInstructions(answer) {
  const text = String(answer || '');
  if (text.length <= MULTI_STEP_MIN_CHARS) return false;
  return NUMBERED_STEP_RE.test(text) || /\b1\)|\b2\)/.test(text);
}

function pickBestFaqEntry(faqEntries = [], topicHints = []) {
  const entries = (faqEntries || []).filter((entry) =>
    isCustomerFacingFaqEntry(entry, { forOffline: true })
  );
  if (!entries.length) return null;

  if (topicHints?.length) {
    for (const hint of topicHints) {
      const match = entries.find((entry) => topicsMatch(entry.topic, hint));
      if (match) return match;
    }
  }

  return entries[0];
}

function buildSoftCta(settings) {
  if (settings?.tone === 'formal') {
    return 'Se precisar de mais alguma informação, estou à disposição.';
  }
  return 'Se precisar de mais alguma coisa, é só chamar!';
}

/**
 * @param {object} params
 * @returns {{ text: string, usedSettings: boolean }}
 */
function formatTrainingReply({
  answer,
  topic = '',
  settings = null,
  externalLinksBlock = '',
  establishmentName = '',
  userText = '',
  messageHistory = [],
  options = {},
}) {
  void establishmentName;
  void userText;

  let text = cleanFaqAnswer(answer);
  if (!text) {
    return { text: '', usedSettings: false };
  }

  let usedSettings = false;

  if (settings?.use_emojis === false) {
    text = stripEmojis(text);
    usedSettings = true;
  }

  if (settings?.response_size === 'curta') {
    text = truncateCurta(text);
    usedSettings = true;
  } else if (settings?.response_size === 'longa') {
    const trimmed = truncateLonga(text);
    if (trimmed !== text) usedSettings = true;
    text = trimmed;
  }

  let addedGreeting = false;
  if (settings && shouldAddGreeting(settings, messageHistory, text)) {
    text = `${buildGreetingPrefix(settings)}${text}`;
    addedGreeting = true;
    usedSettings = true;
  }

  if (settings?.tone === 'formal') {
    const formalized = applyFormalTone(text, addedGreeting);
    if (formalized !== text) usedSettings = true;
    text = formalized;
  }

  const linkResult = appendRelevantLink(text, topic, externalLinksBlock);
  text = linkResult.text;
  if (linkResult.appended) usedSettings = true;

  if (options.appendCta) {
    text = `${text.trim()}\n\n${buildSoftCta(settings)}`;
    usedSettings = true;
  }

  return { text: text.trim(), usedSettings };
}

function shouldPreferDirectFaqReply({ userText, faqEntries = [], topicHints = [] }) {
  const directEnabled = String(process.env.FAQ_DIRECT_REPLY ?? 'true')
    .trim()
    .toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(directEnabled)) return false;

  const question = String(userText || '').trim();
  if (!question) return false;

  const reservationIntent = looksLikeReservationIntent(question);
  const informationalTurn = isInformationalFaqTurn(question);

  if (looksLikeReservationPushOnly(question)) return false;
  if (reservationIntent && !informationalTurn) return false;
  if (!informationalTurn) return false;

  const customerFacing = (faqEntries || []).filter((entry) =>
    isCustomerFacingFaqEntry(entry, { forOffline: true })
  );
  if (!customerFacing.length) return false;

  const best = pickBestFaqEntry(customerFacing, topicHints);
  if (!best?.answer) return false;
  if (looksLikeMultiStepInstructions(best.answer)) return false;

  if (customerFacing.length === 1) return true;

  if (Array.isArray(topicHints) && topicHints.length === 1) {
    const matching = customerFacing.filter((entry) => topicsMatch(entry.topic, topicHints[0]));
    if (matching.length === 1) return true;
  }

  return false;
}

module.exports = {
  formatTrainingReply,
  shouldPreferDirectFaqReply,
  pickBestFaqEntry,
  cleanFaqAnswer,
  stripEmojis,
  truncateCurta,
  truncateLonga,
  parseExternalLinkLines,
  looksLikeMultiStepInstructions,
};

function countQuestions(text) {
  if (text == null) return 0;
  const matches = String(text).match(/\?/g);
  return matches ? matches.length : 0;
}

function keepFirstQuestion(text) {
  if (text == null) return '';
  const raw = String(text);
  const idx = raw.indexOf('?');
  if (idx === -1) return raw;
  return raw.slice(0, idx + 1).trim();
}

function withSingleLeadSentence(questionText) {
  const qPos = questionText.indexOf('?');
  if (qPos === -1) return questionText.trim();
  const before = questionText.slice(0, qPos);
  const breaks = [...before.matchAll(/[.!](?=\s)/g)];
  if (breaks.length <= 1) return questionText.trim();
  const previous = breaks[breaks.length - 2];
  return questionText.slice(previous.index + 1).trim();
}

function sanitizeToOneQuestion(text) {
  const raw = text == null ? '' : String(text).trim();
  if (countQuestions(raw) < 2) return raw;
  return withSingleLeadSentence(keepFirstQuestion(raw));
}

module.exports = {
  countQuestions,
  keepFirstQuestion,
  sanitizeToOneQuestion,
};

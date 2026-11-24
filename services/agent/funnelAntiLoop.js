'use strict';

/**
 * Evita a Sol repetir a mesma pergunta do funil quando o cliente já respondeu.
 * Se a próxima pergunta for igual à última da assistente, tenta avançar ou
 * aceitar a resposta curta (1/2/3, coberta, externa, etc.).
 */

function fold(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lastAssistantText(messageHistory = []) {
  const last = [...(messageHistory || [])].reverse().find((msg) => msg?.role === 'assistant');
  return String(last?.content || '').trim();
}

function sameFunnelQuestion(nextQuestion, lastAssistant) {
  const next = fold(nextQuestion);
  const prev = fold(lastAssistant);
  if (!next || !prev) return false;
  if (next === prev) return true;
  const probe = next.slice(0, Math.min(42, next.length));
  if (probe.length >= 18 && prev.includes(probe)) return true;
  // Mesma pergunta de área com wording levemente diferente.
  const areaCue =
    (next.includes('coberta') && next.includes('descoberta')) ||
    (next.includes('balcao') && next.includes('praca')) ||
    (next.includes('interna') && next.includes('externa')) ||
    (next.includes('deck') && next.includes('bar central'));
  if (!areaCue) return false;
  return (
    (prev.includes('coberta') && prev.includes('descoberta')) ||
    (prev.includes('balcao') && prev.includes('praca')) ||
    (prev.includes('interna') && prev.includes('externa')) ||
    (prev.includes('deck') && prev.includes('bar central')) ||
    prev.includes('qual area')
  );
}

function countRecentSameQuestion(messageHistory = [], question) {
  const target = fold(question);
  if (!target) return 0;
  let count = 0;
  for (const msg of [...(messageHistory || [])].reverse()) {
    if (msg?.role !== 'assistant') continue;
    if (sameFunnelQuestion(question, msg.content)) count += 1;
    else break;
  }
  return count;
}

function pickAreaOptionByIndex(establishmentId, index) {
  const id = Number(establishmentId);
  const n = Number(index);
  if (!Number.isFinite(n) || n < 1) return null;
  if (id === 1) {
    if (n === 1) return { justino_zone: 'coberta', area_label: 'área coberta', area_preferida: 'área coberta', area_id: 1 };
    if (n === 2) return { justino_zone: 'descoberta', area_label: 'área descoberta', area_preferida: 'área descoberta', area_id: 2 };
  }
  if (id === 8) {
    if (n === 1) return { area_label: 'Balcão', area_preferida: 'Balcão' };
    if (n === 2) return { area_label: 'Praça', area_preferida: 'Praça' };
  }
  if (id === 9) {
    if (n === 1) return { area_label: 'Área Interna', area_preferida: 'Área Interna' };
    if (n === 2) return { area_label: 'Área Externa', area_preferida: 'Área Externa' };
    if (n === 3) return { area_label: 'Salão', area_preferida: 'Salão' };
  }
  if (id === 7) {
    if (n === 1) return { area_label: 'Deck - Mesas', area_preferida: 'Deck - Mesas', area_id: 2 };
    if (n === 2) return { area_label: 'Deck - Mesas Redondas', area_preferida: 'Deck - Mesas Redondas', area_id: 2 };
    if (n === 3) return { area_label: 'Bar Central - Bistrôs de Espera', area_preferida: 'Bar Central - Bistrôs de Espera', area_id: 2 };
  }
  return null;
}

function looksLikeAreaQuestion(text) {
  const t = fold(text);
  return (
    (t.includes('coberta') && t.includes('descoberta')) ||
    (t.includes('balcao') && t.includes('praca')) ||
    (t.includes('interna') && t.includes('externa')) ||
    (t.includes('deck') && t.includes('bar central')) ||
    t.includes('qual area combina') ||
    t.includes('prefere a area') ||
    t.includes('prefere area')
  );
}

function lastUserText(messageHistory = []) {
  const last = [...(messageHistory || [])].reverse().find((msg) => msg?.role === 'user');
  return String(last?.content || '').trim();
}

function parseShortAreaAnswer(userText, establishmentId) {
  const raw = String(userText || '').trim();
  if (!raw) return null;
  if (/^\s*[123]\s*[).:-]?\s*$/.test(raw)) {
    return pickAreaOptionByIndex(establishmentId, Number(raw));
  }
  const t = fold(raw);
  const id = Number(establishmentId);
  if (id === 1) {
    if (/\bcoberta|cobert[oa]|dentro|interna\b/.test(t)) {
      return { justino_zone: 'coberta', area_label: 'área coberta', area_preferida: 'área coberta', area_id: 1 };
    }
    if (/\bdescoberta|descobert[oa]|fora|externa|ar livre\b/.test(t)) {
      return { justino_zone: 'descoberta', area_label: 'área descoberta', area_preferida: 'área descoberta', area_id: 2 };
    }
  }
  if (id === 8) {
    if (/\bbalcao|bar\b/.test(t)) return { area_label: 'Balcão', area_preferida: 'Balcão' };
    if (/\bpraca|pracinha\b/.test(t)) return { area_label: 'Praça', area_preferida: 'Praça' };
  }
  if (id === 9) {
    if (/\bsalao|privativ/.test(t)) return { area_label: 'Salão', area_preferida: 'Salão' };
    if (/\bexterna|descoberta|ar livre\b/.test(t) || t === 'externa') {
      return { area_label: 'Área Externa', area_preferida: 'Área Externa' };
    }
    if (/\binterna|coberta\b/.test(t) || t === 'interna' || t === 'coberta') {
      return { area_label: 'Área Interna', area_preferida: 'Área Interna' };
    }
  }
  if (id === 7) {
    if (/\bmesas? redondas?\b/.test(t)) {
      return { area_label: 'Deck - Mesas Redondas', area_preferida: 'Deck - Mesas Redondas', area_id: 2 };
    }
    if (/\bbar central|bistro|bistros?\b/.test(t)) {
      return {
        area_label: 'Bar Central - Bistrôs de Espera',
        area_preferida: 'Bar Central - Bistrôs de Espera',
        area_id: 2,
      };
    }
    if (/\bdeck|mesas?\b/.test(t)) {
      return { area_label: 'Deck - Mesas', area_preferida: 'Deck - Mesas', area_id: 2 };
    }
  }
  return null;
}

function parseOrdinalAreaChoice(userText, workingState = {}, messageHistory = []) {
  const raw = String(userText || '').trim();
  if (!/^\s*[123]\s*[).:-]?\s*$/.test(raw)) return {};
  if (!looksLikeAreaQuestion(lastAssistantText(messageHistory))) return {};
  const patch = pickAreaOptionByIndex(workingState.establishment_id, Number(raw));
  if (!patch) return {};
  return { ...patch, pending_justino_zone: false };
}

/**
 * Se a próxima pergunta seria a mesma da última, devolve um avanço seguro.
 */
function breakRepeatedFunnelQuestion({
  nextQuestion,
  messageHistory = [],
  workingState = {},
  buildNextQuestion,
} = {}) {
  const last = lastAssistantText(messageHistory);
  if (!nextQuestion || !sameFunnelQuestion(nextQuestion, last)) {
    return { replyText: nextQuestion, workingState, brokeLoop: false };
  }

  const repeats = countRecentSameQuestion(messageHistory, nextQuestion);
  let nextState = { ...workingState };

  // Se a pergunta travada é de área, tenta aproveitar a última resposta curta do cliente.
  if (looksLikeAreaQuestion(nextQuestion) && !nextState.area_label && !nextState.justino_zone) {
    const recovered = parseShortAreaAnswer(lastUserText(messageHistory), nextState.establishment_id);
    if (recovered) {
      nextState = { ...nextState, ...recovered, pending_justino_zone: false };
    }
  }

  // Já repetiu demais: não insiste na mesma frase.
  if (repeats >= 2 && !(nextState.area_label || nextState.justino_zone)) {
    return {
      replyText:
        'Pra eu não te enrolar, já chamei alguém da equipe pra seguir com a sua reserva por aqui.',
      workingState: { ...nextState, needs_human_handoff: true },
      brokeLoop: true,
      handoff: true,
    };
  }

  // Uma repetição (ou área recuperada): tenta a próxima pergunta do funil.
  if (typeof buildNextQuestion === 'function') {
    const alt = buildNextQuestion(nextState);
    if (alt && !sameFunnelQuestion(alt, nextQuestion)) {
      return { replyText: alt, workingState: nextState, brokeLoop: true };
    }
  }

  if (repeats >= 2) {
    return {
      replyText:
        'Pra eu não te enrolar, já chamei alguém da equipe pra seguir com a sua reserva por aqui.',
      workingState: { ...nextState, needs_human_handoff: true },
      brokeLoop: true,
      handoff: true,
    };
  }

  return {
    replyText:
      'Só confirmando o que você mandou agora pra eu seguir — me responde em uma frase curta que eu fecho por aqui.',
    workingState: nextState,
    brokeLoop: true,
  };
}

module.exports = {
  fold,
  sameFunnelQuestion,
  countRecentSameQuestion,
  parseOrdinalAreaChoice,
  parseShortAreaAnswer,
  breakRepeatedFunnelQuestion,
  looksLikeAreaQuestion,
  lastAssistantText,
  lastUserText,
};

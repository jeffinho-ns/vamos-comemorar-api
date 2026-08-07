/**
 * Filtra entradas do painel Treinamento da IA antes de injetar no prompt LLM.
 * Não altera o banco — só a montagem customer-facing do bloco FAQ.
 */

/** Tópicos de comportamento/roteamento — nunca vão ao prompt do cliente (ficam no código). */
const INTERNAL_FAQ_TOPICS = new Set([
  'prioridade_treinamento_ia',
  'tom_atendimento_humano',
  'coleta_dados_progressiva_reserva',
  'primeiro_contato_anuncio',
  'subareas_canonicas_highline',
  'controle_duplicidade_reservas',
  'capacidade_diaria_highline',
  // Fluxos de tool/router: comportamento no AgentPromptBuilder, não no bloco FAQ.
  'reserva_areas_operacional_highline',
  'reserva_grupos_grandes_highline',
  'horario_corte_chegada_reserva',
  // Bloco interno de agenda (nunca resposta ao cliente).
  'agenda_oficial_data_foco',
]);

/** Tópicos com fato útil + meta — mantidos no prompt após limpar instruções à IA. */
const OPERATIONAL_STRIP_TOPICS = new Set([
  'valor_entrada_vs_caucao',
]);

/** Exclusões extras para resposta offline direta (sem LLM). */
const OFFLINE_EXCLUDED_TOPICS = new Set([
  ...INTERNAL_FAQ_TOPICS,
  ...OPERATIONAL_STRIP_TOPICS,
]);

function shouldIncludeMetaRules() {
  return String(process.env.FAQ_PROMPT_INCLUDE_META || '').trim().toLowerCase() === 'true';
}

function looksLikeInternalTrainingAnswer(answer) {
  const text = String(answer || '').trim();
  if (!text) return true;
  if (/^(REGRA|META-REGRA)\b/i.test(text)) return true;
  if (/REGRAS DO PAINEL DE RESERVAS/i.test(text)) return true;
  if (/override_capacidade\s*=/i.test(text)) return true;
  if (/Hor[aá]rio semanal cadastrado/i.test(text)) return true;
  return false;
}

function containsMetaRegraAsPrimaryContent(answer) {
  const text = String(answer || '').trim();
  if (!/META-REGRA/i.test(text)) return false;
  const firstBlock = text.split(/\n{2,}/)[0] || text.slice(0, 240);
  return /META-REGRA/i.test(firstBlock);
}

function isMetaInstructionLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return false;

  if (/^(REGRA|META-REGRA)\b/i.test(trimmed)) return true;
  if (/^REGRA EXCLUSIVA\b/i.test(trimmed)) return true;
  if (/^N[AÃ]O\s+(diga|use|confunda|insista|comente|invente|peça|crie|confirme)\b/i.test(trimmed)) {
    return true;
  }
  if (/^NUNCA\s+(diga|use|confunda|insista|comente|invente|peça|crie|confirme)\b/i.test(trimmed)) {
    return true;
  }
  if (/^PROIBIDO\b/i.test(trimmed)) return true;
  if (/^(O que fazer|Fluxo quando|ETAPA \d|Tom sugerido|Tom:|Observações \(campo)/i.test(trimmed)) {
    return true;
  }
  if (
    /^(consultar_areas_mesa_reserva|verificar_disponibilidade|criar_pre_reserva|criar_lista_espera)\b/i.test(
      trimmed
    )
  ) {
    return true;
  }
  if (/^\d+\)\s/.test(trimmed) && /(consultar|verificar|criar_|NÃO|REGISTRE|Confirme|Só use|Responda|Espere)/i.test(trimmed)) {
    return true;
  }
  if (/^•\s*(data \+|nome completo|área preferida|Em seguida|Se o cliente)/i.test(trimmed)) {
    return true;
  }
  if (/^Nesse primeiro contato:/i.test(trimmed)) return true;
  if (/^Se o cliente já mandou parte dos dados/i.test(trimmed)) return true;
  if (/^Quando todos os dados estiverem coletados/i.test(trimmed)) return true;
  if (/^Não use este tópico para preços/i.test(trimmed)) return true;
  if (/^A IA NÃO consulta/i.test(trimmed)) return true;
  if (/^Use sempre o label exato vindo/i.test(trimmed)) return true;
  return false;
}

function stripMetaInstructionsFromAnswer(answer) {
  const lines = String(answer || '').split('\n');
  const kept = [];

  for (const line of lines) {
    if (isMetaInstructionLine(line)) continue;
    kept.push(line);
  }

  let result = kept.join('\n').trim();
  result = result.replace(/^REGRA[^:\n]*:\s*/gim, '').trim();
  result = result.replace(/^META-REGRA[^:\n]*:\s*/gim, '').trim();
  result = result.replace(/\n{3,}/g, '\n\n');
  return result;
}

function isInternalFaqTopic(topic) {
  return INTERNAL_FAQ_TOPICS.has(String(topic || '').trim());
}

function isCustomerFacingFaqEntry(entry, { forOffline = false } = {}) {
  const topic = String(entry?.topic || '').trim();
  const answer = String(entry?.answer || '').trim();
  if (!topic || !answer) return false;

  const excludedTopics = forOffline ? OFFLINE_EXCLUDED_TOPICS : INTERNAL_FAQ_TOPICS;
  if (excludedTopics.has(topic)) return false;

  if (forOffline && OPERATIONAL_STRIP_TOPICS.has(topic)) return false;

  if (!forOffline && OPERATIONAL_STRIP_TOPICS.has(topic)) {
    const stripped = stripMetaInstructionsFromAnswer(answer);
    return Boolean(stripped);
  }

  if (looksLikeInternalTrainingAnswer(answer)) return false;
  if (containsMetaRegraAsPrimaryContent(answer)) return false;
  return true;
}

function prepareFaqEntryForPrompt(entry) {
  if (!entry) return null;
  const topic = String(entry.topic || '').trim();
  let answer = String(entry.answer || '').trim();
  if (!topic || !answer) return null;

  // Sempre limpa meta (REGRA/fluxo/tools) — o cliente só vê fatos.
  answer = stripMetaInstructionsFromAnswer(answer);

  if (!answer) return null;
  return { ...entry, answer };
}

function scoreFactualEntry(entry) {
  const answer = String(entry?.answer || '');
  let score = 0;

  if (/\d+h|\d:\d|R\$\s*\d/i.test(answer)) score += 4;
  if (answer.length > 40 && answer.length < 800) score += 2;
  if (!/^(REGRA|META-REGRA)/i.test(answer.trim())) score += 2;
  if (!INTERNAL_FAQ_TOPICS.has(String(entry?.topic || '').trim())) score += 1;
  if (OPERATIONAL_STRIP_TOPICS.has(String(entry?.topic || '').trim())) score += 1;

  const stripped = stripMetaInstructionsFromAnswer(answer);
  if (stripped && stripped.length >= 20) score += 2;

  return score;
}

function pickFallbackFactualEntries(entries, limit = 2) {
  const ranked = entries
    .map((entry) => ({ entry, score: scoreFactualEntry(entry) }))
    .sort((a, b) => b.score - a.score);

  const fallback = [];
  for (const { entry } of ranked) {
    if (fallback.length >= limit) break;
    const prepared =
      prepareFaqEntryForPrompt(entry) ||
      (() => {
        const stripped = stripMetaInstructionsFromAnswer(entry.answer);
        return stripped ? { ...entry, answer: stripped } : null;
      })();
    if (prepared?.answer) fallback.push(prepared);
  }
  return fallback;
}

/**
 * Remove meta-treinamento das FAQs antes de montar o bloco do prompt LLM.
 * Se o filtro esvaziar a lista, mantém 1–2 entradas factuais para não quebrar FAQ-first.
 */
function filterFaqsForCustomerPrompt(entries = []) {
  if (shouldIncludeMetaRules()) {
    return entries.map((entry) => ({ ...entry }));
  }

  const input = (entries || []).filter((entry) => entry?.topic && entry?.answer);
  if (!input.length) return [];

  const filtered = [];
  for (const entry of input) {
    if (!isCustomerFacingFaqEntry(entry)) continue;
    const prepared = prepareFaqEntryForPrompt(entry);
    if (prepared) filtered.push(prepared);
  }

  if (!filtered.length) {
    return pickFallbackFactualEntries(input, 2);
  }

  return filtered;
}

module.exports = {
  INTERNAL_FAQ_TOPICS,
  OPERATIONAL_STRIP_TOPICS,
  OFFLINE_EXCLUDED_TOPICS,
  shouldIncludeMetaRules,
  looksLikeInternalTrainingAnswer,
  containsMetaRegraAsPrimaryContent,
  stripMetaInstructionsFromAnswer,
  isInternalFaqTopic,
  isCustomerFacingFaqEntry,
  prepareFaqEntryForPrompt,
  filterFaqsForCustomerPrompt,
};

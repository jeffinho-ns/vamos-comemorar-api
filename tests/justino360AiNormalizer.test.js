'use strict';

/**
 * Parser/normalizer das respostas da IA do Justino360 — funções puras.
 * Nenhuma chamada à OpenAI: roda offline, sem OPENAI_API_KEY e sem banco.
 * Rodar: node --test tests/justino360AiNormalizer.test.js
 */
const {
  parseJsonLoose,
  normalizeChecklist,
  normalizePop,
  normalizeSummary,
  normalizeInsights,
  buildFallbackInsights,
  SHIFT_TYPES,
  ROLE_KEYS,
} = require('../services/justino360/aiNormalizer');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ---------- parseJsonLoose ----------
assert(parseJsonLoose('{"a":1}').a === 1, 'JSON limpo');
assert(parseJsonLoose({ a: 2 }).a === 2, 'objeto já parseado passa direto');
assert(parseJsonLoose('```json\n{"a":3}\n```').a === 3, 'cerca markdown com json');
assert(parseJsonLoose('```\n{"a":4}\n```').a === 4, 'cerca markdown sem linguagem');
assert(
  parseJsonLoose('Claro! Segue o resultado:\n{"a":5}\nQualquer dúvida me chame.').a === 5,
  'JSON cercado de prosa'
);
assert(parseJsonLoose('[{"title":"x"}]').items.length === 1, 'array na raiz vira { items }');
assert(parseJsonLoose('') === null, 'string vazia é falha');
assert(parseJsonLoose('   ') === null, 'só espaço é falha');
assert(parseJsonLoose(null) === null, 'null é falha');
assert(parseJsonLoose('não consegui gerar') === null, 'prosa sem JSON é falha');
assert(parseJsonLoose('{quebrado') === null, 'JSON inválido é falha');
assert(parseJsonLoose('"apenas string"') === null, 'string JSON não é objeto');

// ---------- normalizeChecklist ----------
const checklist = normalizeChecklist({
  nome: 'Abertura do bar',
  turno: 'ABERTURA',
  itens: [
    { titulo: 'Conferir gelo', exige_foto: 'sim' },
    'Ligar chopeira',
    { title: 'conferir GELO' },
    { title: '' },
    { description: 'sem título' },
  ],
});
assert(checklist.name === 'Abertura do bar', 'aceita chave em português');
assert(checklist.shift_type === 'abertura', 'shift_type normalizado para minúsculo');
assert(checklist.items.length === 2, 'dedupe por título e descarte de item sem título');
assert(checklist.items[0].requires_photo === true, '"sim" liga requires_photo');
assert(checklist.items[1].title === 'Ligar chopeira', 'item string vira objeto');
assert(checklist.items[1].requires_photo === false, 'item string não exige foto');
assert(checklist.items[1].description === null, 'descrição ausente vira null');

const checklistFallback = normalizeChecklist(
  { shift_type: 'inventado' },
  { fallbackName: 'Checklist cozinha' }
);
assert(checklistFallback.name === 'Checklist cozinha', 'usa fallbackName quando falta nome');
assert(checklistFallback.shift_type === 'rotina', 'shift_type fora da whitelist cai em rotina');
assert(checklistFallback.items.length === 0, 'sem itens devolve array vazio (rota trata)');
assert(SHIFT_TYPES.includes(checklistFallback.shift_type), 'shift_type sempre da whitelist');

const checklistCap = normalizeChecklist({
  items: Array.from({ length: 90 }, (_, i) => `Item ${i}`),
});
assert(checklistCap.items.length === 60, 'teto de 60 itens');

assert(normalizeChecklist(null).items.length === 0, 'payload null não quebra');
assert(normalizeChecklist('texto').items.length === 0, 'payload string não quebra');

// ---------- normalizePop ----------
const pop = normalizePop({ titulo: 'Fechamento do caixa', funcao: 'Caixa', corpo: 'Passo 1...' });
assert(pop.title === 'Fechamento do caixa', 'título em português');
assert(pop.role_key === 'caixa', 'role_key normalizada e minúscula');
assert(pop.body === 'Passo 1...', 'corpo preservado');

const popRoleInvalida = normalizePop({ title: 'Geral', role_key: 'sommelier', body: 'x' });
assert(popRoleInvalida.role_key === null, 'role_key fora da whitelist vira null');

const popAcento = normalizePop({ title: 'T', role_key: 'Segurança', body: 'x' });
assert(popAcento.role_key === 'seguranca', 'acento normalizado para a whitelist');
assert(ROLE_KEYS.includes(popAcento.role_key), 'role_key sempre da whitelist');

const popSteps = normalizePop({ title: 'T', etapas: ['Abrir gaveta', { texto: 'Contar notas' }] });
assert(
  popSteps.body === '1. Abrir gaveta\n2. Contar notas',
  'monta corpo numerado quando vem só passos'
);

const popHint = normalizePop({ body: 'x' }, { roleHint: 'barman', fallbackTitle: 'POP sem título' });
assert(popHint.role_key === 'barman', 'roleHint entra quando o modelo omite role_key');
assert(popHint.title === 'POP sem título', 'usa fallbackTitle');

const popMultilinha = normalizePop({ title: 'T', body: 'Linha 1\nLinha 2' });
assert(popMultilinha.body.includes('\n'), 'corpo preserva quebra de linha');

// ---------- normalizeSummary ----------
const summary = normalizeSummary({
  resumo: 'Reunião tratou de estoque.',
  acoes: [
    { decisao: 'Repor taças', tarefa: 'Comprar 60 taças', prioridade: 'ALTA', responsavel: 'Maitre' },
    'Revisar escala',
    { decision: '' },
  ],
});
assert(summary.summary === 'Reunião tratou de estoque.', 'resumo em português');
assert(summary.action_items.length === 2, 'descarta item vazio');
assert(summary.action_items[0].priority === 'alta', 'prioridade normalizada');
assert(summary.action_items[0].owner === 'Maitre', 'responsável mapeado para owner');
assert(
  summary.action_items[1].suggested_task === 'Revisar escala',
  'string vira decision + suggested_task'
);
assert(summary.action_items[1].priority === 'media', 'prioridade ausente cai em media');

const summarySemTask = normalizeSummary({ summary: 'x', action_items: [{ decision: 'Trocar filtro' }] });
assert(
  summarySemTask.action_items[0].suggested_task === 'Trocar filtro',
  'suggested_task cai para decision (é o que vai virar tarefa)'
);

const summaryVazio = normalizeSummary({ summary: '' });
assert(summaryVazio.summary === '', 'resumo vazio sinaliza falha para a rota');
assert(Array.isArray(summaryVazio.action_items), 'action_items sempre array');

const summaryParagrafo = normalizeSummary({ summary: 'P1\n\nP2' });
assert(summaryParagrafo.summary.includes('\n'), 'resumo preserva parágrafos');

// ---------- normalizeInsights ----------
const insights = normalizeInsights({
  insights: ['Chopeira falhou 4x', { texto: 'Gelo acabou 3x' }, ''],
  suggested_actions: [
    { titulo: 'Contratar manutenção', motivo: 'Falha recorrente', prioridade: 'critica' },
    'Revisar pedido de gelo',
  ],
});
assert(insights.insights.length === 2, 'insights aceita string e objeto, descarta vazio');
assert(insights.insights[1] === 'Gelo acabou 3x', 'insight objeto extraído');
assert(insights.suggested_actions[0].priority === 'critica', 'prioridade crítica preservada');
assert(insights.suggested_actions[1].why === null, 'ação string tem why null');

const insightsVazio = normalizeInsights({});
assert(insightsVazio.insights.length === 0 && insightsVazio.suggested_actions.length === 0, 'shape estável vazio');

// ---------- buildFallbackInsights (caminho sem OPENAI_API_KEY) ----------
const fallback = buildFallbackInsights([
  { title: 'Chopeira sem pressão', times: 6, sector_name: 'Bar' },
  { title: 'Banheiro sem papel', times: 2 },
  { title: '', times: 9 },
]);
assert(fallback.insights.length === 2, 'linha sem título é ignorada');
assert(
  fallback.insights[0] === '"Chopeira sem pressão" em Bar apareceu 6x nos últimos 60 dias.',
  'texto determinístico com setor'
);
assert(fallback.insights[1].includes('apareceu 2x'), 'linha sem setor não vaza "undefined"');
assert(fallback.suggested_actions[0].priority === 'alta', '6 ocorrências => prioridade alta');
assert(fallback.suggested_actions[1].priority === 'media', '2 ocorrências => prioridade media');
assert(buildFallbackInsights(null).insights.length === 0, 'entrada null não quebra');
assert(buildFallbackInsights(undefined).suggested_actions.length === 0, 'entrada undefined não quebra');

console.log('justino360AiNormalizer: ok');

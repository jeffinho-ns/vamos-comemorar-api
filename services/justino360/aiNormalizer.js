'use strict';

/**
 * Justino360 IA — parsing e normalização das respostas do modelo.
 *
 * Funções puras: nada de rede, nada de banco. É aqui que o "JSON quase certo"
 * que o modelo devolve (com cercas de markdown, prosa em volta, campo com nome
 * alternativo, item como string em vez de objeto) vira um shape único e estável
 * para a rota e para a UI. Sem isso a tela precisaria adivinhar o formato a cada
 * geração.
 */

const { PRIORITIES } = require('./constants');

/** Turnos aceitos por j360_checklist_templates.shift_type. */
const SHIFT_TYPES = ['abertura', 'fechamento', 'rotina', 'inspecao'];

/**
 * Espelha a whitelist de `role_key` da API de documentos
 * (routes/justino360/documents.js). Precisa continuar igual, senão o botão
 * "Salvar como documento" recebe 400 na volta.
 */
const ROLE_KEYS = [
  'garcom',
  'barman',
  'caixa',
  'cozinha',
  'copa',
  'limpeza',
  'seguranca',
  'recepcao',
  'maitre',
  'runner',
  'gerencia',
];

const MAX_CHECKLIST_ITEMS = 60;
const MAX_ACTION_ITEMS = 30;
const MAX_INSIGHTS = 20;

function clean(value, max) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return clean(value.filter((v) => v !== null && v !== undefined).join('\n'), max);
  }
  if (typeof value === 'object') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Igual a `clean`, mas preserva quebras de linha (corpo de POP, resumo longo). */
function cleanMultiline(value, max) {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) {
    return value
      .map((v) => cleanMultiline(v, max))
      .filter(Boolean)
      .join('\n')
      .slice(0, max);
  }
  if (typeof value === 'object') return '';
  return String(value).replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim().slice(0, max);
}

function firstFilled(source, keys, max, multiline = false) {
  if (!source || typeof source !== 'object') return '';
  for (const key of keys) {
    const value = multiline ? cleanMultiline(source[key], max) : clean(source[key], max);
    if (value) return value;
  }
  return '';
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function oneOfList(value, allowed, fallback) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');
  return allowed.includes(normalized) ? normalized : fallback;
}

function toBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const v = String(value || '')
    .trim()
    .toLowerCase();
  return ['true', '1', 'sim', 'yes', 'obrigatoria', 'obrigatorio'].includes(v);
}

/**
 * JSON tolerante. Ordem de tentativas:
 * 1. objeto já parseado (o SDK pode devolver assim em algumas versões);
 * 2. string limpa;
 * 3. conteúdo dentro de cerca ```json … ```;
 * 4. maior trecho entre a primeira `{` e a última `}`.
 * Devolve `null` quando nada disso resulta em objeto — a rota trata como 502.
 */
function parseJsonLoose(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;

  const text = String(raw === undefined || raw === null ? '' : raw).trim();
  if (!text) return null;

  const candidates = [text];

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) candidates.push(fenced[1].trim());

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed)) return { items: parsed };
    } catch {
      // tenta o próximo candidato
    }
  }
  return null;
}

/**
 * Checklist pronto para virar template:
 * `{ name, shift_type, items: [{ title, description, requires_photo }] }`
 * Itens duplicados (mesmo título, ignorando caixa/acento) são descartados —
 * o modelo repete bastante quando a instrução é longa.
 */
function normalizeChecklist(payload, { fallbackName = 'Checklist operacional' } = {}) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const name = firstFilled(source, ['name', 'nome', 'title', 'titulo'], 200) || fallbackName;
  const shiftType = oneOfList(
    source.shift_type ?? source.shiftType ?? source.turno,
    SHIFT_TYPES,
    'rotina'
  );

  const rawItems = toArray(
    source.items ?? source.itens ?? source.checklist ?? source.tasks ?? source.perguntas
  );

  const seen = new Set();
  const items = [];
  for (const raw of rawItems) {
    const isObject = raw && typeof raw === 'object' && !Array.isArray(raw);
    const title = isObject
      ? firstFilled(raw, ['title', 'titulo', 'item', 'name', 'nome', 'descricao_curta'], 300)
      : clean(raw, 300);
    if (!title) continue;

    const key = title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      title,
      description: isObject
        ? firstFilled(raw, ['description', 'descricao', 'detalhe', 'observacao'], 1000) || null
        : null,
      requires_photo: isObject
        ? toBool(raw.requires_photo ?? raw.requiresPhoto ?? raw.foto ?? raw.exige_foto)
        : false,
    });
    if (items.length >= MAX_CHECKLIST_ITEMS) break;
  }

  return { name, shift_type: shiftType, items };
}

/**
 * POP pronto para virar documento: `{ title, role_key, body }`.
 * `role_key` fora da whitelist volta como `null` (documento geral) em vez de
 * quebrar o POST /documents depois.
 */
function normalizePop(payload, { fallbackTitle = 'Procedimento operacional', roleHint = '' } = {}) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const title = firstFilled(source, ['title', 'titulo', 'name', 'nome'], 300) || fallbackTitle;
  const roleKey = oneOfList(source.role_key ?? source.roleKey ?? source.funcao ?? roleHint, ROLE_KEYS, null);

  let body = firstFilled(
    source,
    ['body', 'corpo', 'content', 'conteudo', 'texto', 'procedimento', 'pop'],
    20000,
    true
  );
  if (!body) {
    const steps = toArray(source.steps ?? source.etapas ?? source.passos);
    body = steps
      .map((step, index) => {
        const text =
          step && typeof step === 'object'
            ? firstFilled(step, ['title', 'titulo', 'description', 'descricao', 'text', 'texto'], 1000, true)
            : cleanMultiline(step, 1000);
        return text ? `${index + 1}. ${text}` : '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return { title, role_key: roleKey, body };
}

function normalizePriority(value) {
  return oneOfList(value, PRIORITIES, 'media');
}

/**
 * Resumo de ata/relatório: `{ summary, action_items: [{ decision, suggested_task, priority, owner }] }`.
 * Cada `suggested_task` é o que o botão "Criar tarefas" manda para POST /tasks,
 * então precisa vir sempre preenchido — cai para `decision` quando o modelo omite.
 */
function normalizeSummary(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const summary = firstFilled(source, ['summary', 'resumo', 'text', 'texto', 'conteudo'], 8000, true);

  const rawItems = toArray(
    source.action_items ?? source.actionItems ?? source.acoes ?? source.decisoes ?? source.tasks
  );

  const actionItems = [];
  for (const raw of rawItems) {
    const isObject = raw && typeof raw === 'object' && !Array.isArray(raw);
    const decision = isObject
      ? firstFilled(raw, ['decision', 'decisao', 'item', 'title', 'titulo', 'assunto'], 500)
      : clean(raw, 500);
    const suggestedTask = isObject
      ? firstFilled(raw, ['suggested_task', 'suggestedTask', 'tarefa', 'task', 'acao', 'action'], 300)
      : '';

    const finalTask = suggestedTask || decision;
    if (!finalTask) continue;

    actionItems.push({
      decision: decision || finalTask,
      suggested_task: finalTask.slice(0, 300),
      priority: normalizePriority(isObject ? raw.priority ?? raw.prioridade : null),
      owner: isObject ? firstFilled(raw, ['owner', 'responsavel', 'assignee'], 120) || null : null,
    });
    if (actionItems.length >= MAX_ACTION_ITEMS) break;
  }

  return { summary, action_items: actionItems };
}

/**
 * Insights de recorrência: `{ insights: string[], suggested_actions: [{ title, why, priority }] }`.
 */
function normalizeInsights(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};

  const insights = [];
  for (const raw of toArray(source.insights ?? source.analise ?? source.observacoes)) {
    const text =
      raw && typeof raw === 'object'
        ? firstFilled(raw, ['insight', 'text', 'texto', 'title', 'titulo', 'descricao'], 500)
        : clean(raw, 500);
    if (text) insights.push(text);
    if (insights.length >= MAX_INSIGHTS) break;
  }

  const suggestedActions = [];
  for (const raw of toArray(
    source.suggested_actions ?? source.suggestedActions ?? source.acoes ?? source.action_items
  )) {
    const isObject = raw && typeof raw === 'object' && !Array.isArray(raw);
    const title = isObject
      ? firstFilled(raw, ['title', 'titulo', 'action', 'acao', 'task', 'tarefa'], 300)
      : clean(raw, 300);
    if (!title) continue;
    suggestedActions.push({
      title,
      why: isObject ? firstFilled(raw, ['why', 'porque', 'motivo', 'justificativa'], 500) || null : null,
      priority: normalizePriority(isObject ? raw.priority ?? raw.prioridade : null),
    });
    if (suggestedActions.length >= MAX_ACTION_ITEMS) break;
  }

  return { insights, suggested_actions: suggestedActions };
}

/**
 * Insights determinísticos a partir das linhas de j360_incidents.
 * É o que a tela mostra quando OPENAI_API_KEY não está configurada — dado real
 * agregado, sem inventar causa raiz.
 */
function buildFallbackInsights(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const insights = [];
  const suggestedActions = [];

  for (const row of list.slice(0, MAX_INSIGHTS)) {
    const title = clean(row?.title, 300);
    if (!title) continue;
    const times = Number(row?.times) || 0;
    const sector = clean(row?.sector_name, 120);
    const where = sector ? ` em ${sector}` : '';
    insights.push(`"${title}"${where} apareceu ${times}x nos últimos 60 dias.`);
    suggestedActions.push({
      title: `Investigar causa raiz: ${title}`.slice(0, 300),
      why: `Reincidência de ${times} registros${where}.`,
      priority: times >= 5 ? 'alta' : 'media',
    });
  }

  return { insights, suggested_actions: suggestedActions };
}

module.exports = {
  SHIFT_TYPES,
  ROLE_KEYS,
  MAX_CHECKLIST_ITEMS,
  parseJsonLoose,
  normalizeChecklist,
  normalizePop,
  normalizeSummary,
  normalizeInsights,
  buildFallbackInsights,
};

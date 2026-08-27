'use strict';

/**
 * Staff Agent Fase 3 — criar OS de Artista/Banda/DJ pelo chat.
 *
 * Espelha o modal "Nova OS de Artista/Banda/DJ"
 * (app/components/ArtistOSCreateModal.tsx): grava em operational_details com
 * os_type='artist', mapeando project_name → artistic_attraction/event_name,
 * working_hours → show_schedule, ticket_values → ticket_prices, e os demais
 * campos livres dentro de admin_notes.dynamicFields.
 *
 * Só o esqueleto operacional. Contrato, dados bancários e cachê continuam
 * exclusivamente na tela de edição — não se coleta PII sensível por chat.
 */

const { parseFlexibleDate, formatBr } = require('./agendaBlockHelpers');

/** Realtime é opcional: nunca deve derrubar a criação da OS. */
function emitOsChange(params) {
  try {
    require('../../utils/osRealtime').emitOperationalDetailChanged(params);
  } catch (e) {
    console.warn('[staffAgent] OS realtime indisponível:', e.message);
  }
}

/** Campos livres do modal, na ordem em que aparecem na tela. */
const DYNAMIC_FIELDS = [
  ['benefits', 'Benefícios'],
  ['menu', 'Cardápio'],
  ['briefing', 'Briefing'],
  ['partnership', 'Parceria'],
  ['tv_games', 'Jogos para passar na TV'],
];

function cleanText(value) {
  const s = String(value ?? '').trim();
  return s || null;
}

/**
 * "sem briefing", "não vai ter parceria", "nenhum jogo" → campo vazio.
 * Evita gravar a própria negação como se fosse conteúdo da OS.
 */
const NEGATION_RE =
  /^(sem\b|nao\b|não\b|nenhum|nenhuma|n\/a|na$|-|nada\b|nao ha|não há|nao tem|não tem|nao vai|não vai|nao have|indefinido|a definir|nd$)/i;

function cleanOptionalText(value) {
  const s = cleanText(value);
  if (!s) return null;
  const normalized = s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (NEGATION_RE.test(normalized) && normalized.length <= 40) return null;
  return s;
}

function slugifyLabel(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Campos extras ditados pelo colaborador.
 * Aceita objeto/JSON {"Estacionamento": "grátis"} ou texto "Estacionamento: grátis; Dress code: casual".
 */
function parseExtraFields(input) {
  if (!input) return {};
  let raw = input;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    if (trimmed.startsWith('{')) {
      try {
        raw = JSON.parse(trimmed);
      } catch {
        raw = null;
      }
    } else {
      raw = null;
    }
    if (!raw) {
      const out = {};
      for (const part of String(input).split(/[;\n]+/)) {
        const idx = part.indexOf(':');
        if (idx <= 0) continue;
        const key = slugifyLabel(part.slice(0, idx));
        const value = part.slice(idx + 1).trim();
        if (key && value) out[key] = value;
      }
      return out;
    }
  }

  if (typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [label, value] of Object.entries(raw)) {
    const key = slugifyLabel(label);
    const text = cleanText(value);
    if (key && text) out[key] = text;
  }
  return out;
}

/** Numeração DDMMYYYY-NNN, em série dentro da mesma data. */
async function gerarOsNumber(pool, dateIso) {
  const [y, m, d] = String(dateIso).split('-');
  const prefix = `${d}${m}${y}`;
  let next = 1;
  try {
    const { rows } = await pool.query(
      `SELECT os_number
         FROM operational_details
        WHERE os_number LIKE $1`,
      [`${prefix}-%`]
    );
    const used = rows
      .map((r) => Number(String(r.os_number).split('-')[1]))
      .filter((n) => Number.isFinite(n));
    if (used.length) next = Math.max(...used) + 1;
  } catch (e) {
    // Coluna os_number ainda não existe neste ambiente.
    if (e.code === '42703') return null;
    throw e;
  }
  return `${prefix}-${String(next).padStart(3, '0')}`;
}

/** UNIQUE(event_date) é global: uma data só comporta uma OS em todo o sistema. */
async function findOsOnDate(pool, dateIso) {
  const { rows } = await pool.query(
    `SELECT id, artistic_attraction, establishment_id
       FROM operational_details
      WHERE event_date = $1
      LIMIT 1`,
    [dateIso]
  );
  return rows[0] || null;
}

async function listarOsArtista(pool, { establishmentId, args }) {
  const dateIso = args.date ? parseFlexibleDate(args.date) : null;
  if (args.date && !dateIso) {
    return { ok: false, message: `Não entendi a data "${args.date}".` };
  }

  const params = [establishmentId];
  let dateFilter = '';
  if (dateIso) {
    params.push(dateIso);
    dateFilter = ` AND event_date = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT id, os_number, event_date, artistic_attraction, show_schedule, is_active
       FROM operational_details
      WHERE establishment_id = $1
        ${dateFilter}
      ORDER BY event_date DESC
      LIMIT 15`,
    params
  );

  const items = rows.map((r) => ({
    id: r.id,
    os_number: r.os_number || null,
    date: String(r.event_date).slice(0, 10),
    project_name: r.artistic_attraction,
    active: r.is_active !== false && r.is_active !== 0,
  }));

  const lines = items.map(
    (i) => `${i.os_number || `#${i.id}`} — ${formatBr(i.date)} — ${i.project_name}${i.active ? '' : ' (inativa)'}`
  );

  return {
    ok: true,
    count: items.length,
    items,
    message: items.length
      ? `${items.length} OS:\n${lines.join('\n')}`
      : dateIso
        ? `Nenhuma OS em ${formatBr(dateIso)}.`
        : 'Nenhuma OS cadastrada nesta casa.',
  };
}

async function criarOsArtista(pool, { establishmentId, args, mode }) {
  const dateIso = parseFlexibleDate(args.event_date);
  if (!dateIso) {
    return { ok: false, message: 'Preciso da data do evento. Ex.: "OS para o dia 30/08".' };
  }

  const projectName = cleanText(args.project_name);
  if (!projectName) {
    return { ok: false, message: 'Qual o nome do projeto (artista, banda ou DJ)?' };
  }

  const workingHours = cleanText(args.working_hours);
  if (!workingHours) {
    return { ok: false, message: `Quais os horários de funcionamento em ${formatBr(dateIso)}?` };
  }

  const existing = await findOsOnDate(pool, dateIso);
  if (existing) {
    const mesmaCasa = Number(existing.establishment_id) === Number(establishmentId);
    return {
      ok: false,
      message: mesmaCasa
        ? `Já existe OS em ${formatBr(dateIso)}: "${existing.artistic_attraction}" (#${existing.id}). Edite pela tela de Detalhes Operacionais.`
        : `A data ${formatBr(dateIso)} já tem OS de outro estabelecimento (#${existing.id}). Hoje o sistema aceita só uma OS por data — fale com o admin.`,
    };
  }

  const dynamicFields = {};
  for (const [key] of DYNAMIC_FIELDS) {
    const value = cleanOptionalText(args[key]);
    if (value) dynamicFields[key] = value;
  }
  Object.assign(dynamicFields, parseExtraFields(args.extra_fields));

  const ticketValues = cleanOptionalText(args.ticket_values);
  const promotions = cleanOptionalText(args.promotions);

  // Data de emissão da OS pode diferir da data do evento ("OS de 29/08, evento em 31/08").
  const osDateIso = (args.os_date ? parseFlexibleDate(args.os_date) : null) || dateIso;
  const osNumber = await gerarOsNumber(pool, osDateIso);

  const preview = {
    os_number: osNumber,
    os_date: osDateIso,
    event_date: dateIso,
    establishment_id: establishmentId,
    project_name: projectName,
    working_hours: workingHours,
    ticket_values: ticketValues,
    promotions,
    dynamic_fields: dynamicFields,
  };

  if (mode === 'preview') {
    const linhas = [
      `OS ${osNumber || '(número automático)'}`,
      osDateIso !== dateIso ? `Emitida em: ${formatBr(osDateIso)}` : null,
      `Data do evento: ${formatBr(dateIso)}`,
      `Projeto: ${projectName}`,
      `Horários: ${workingHours}`,
    ];
    if (ticketValues) linhas.push(`Entrada: ${ticketValues}`);
    if (promotions) linhas.push(`Promoções: ${promotions}`);
    for (const [key, value] of Object.entries(dynamicFields)) {
      const label =
        DYNAMIC_FIELDS.find(([k]) => k === key)?.[1] ||
        key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
      linhas.push(`${label}: ${value}`);
    }

    // Campo que o colaborador negou ("sem briefing") já foi respondido: não perguntar de novo.
    const respondido = (arg, valor) => Boolean(valor) || String(arg || '').trim() !== '';
    const faltando = [
      !respondido(args.ticket_values, ticketValues) && 'valores de entrada',
      !respondido(args.promotions, promotions) && 'promoções',
      !respondido(args.benefits, dynamicFields.benefits) && 'benefícios',
      !respondido(args.briefing, dynamicFields.briefing) && 'briefing',
    ].filter(Boolean);

    const pergunta = faltando.length
      ? `\n\nQuer incluir ${faltando.join(', ')} ou mais alguma informação antes de eu criar?`
      : '\n\nQuer adicionar mais alguma informação antes de eu criar?';

    return {
      ok: true,
      needs_confirmation: true,
      preview,
      message: `${linhas.filter(Boolean).join('\n')}${pergunta}`,
    };
  }

  const adminNotes = Object.keys(dynamicFields).length
    ? JSON.stringify({ dynamicFields })
    : null;

  const columns = {
    os_type: 'artist',
    os_number: osNumber,
    establishment_id: establishmentId,
    event_date: dateIso,
    artistic_attraction: projectName,
    event_name: projectName,
    show_schedule: workingHours,
    ticket_prices: ticketValues || 'Não informado',
    promotions,
    admin_notes: adminNotes,
    is_active: 1,
  };

  const names = Object.keys(columns);
  const values = names.map((n) => columns[n]);
  const placeholders = names.map((_, i) => `$${i + 1}`).join(', ');

  let inserted;
  try {
    ({ rows: [inserted] } = await pool.query(
      `INSERT INTO operational_details (${names.join(', ')})
       VALUES (${placeholders})
       RETURNING id, os_number`,
      values
    ));
  } catch (e) {
    // Ambiente sem as colunas de OS: grava o mínimo que a tabela base aceita.
    if (e.code !== '42703') throw e;
    ({ rows: [inserted] } = await pool.query(
      `INSERT INTO operational_details
         (establishment_id, event_date, artistic_attraction, show_schedule, ticket_prices, promotions, admin_notes, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
       RETURNING id`,
      [
        establishmentId,
        dateIso,
        projectName,
        workingHours,
        ticketValues || 'Não informado',
        promotions,
        adminNotes,
      ]
    ));
  }

  emitOsChange({
    establishmentId,
    action: 'created',
    detailId: inserted?.id,
    osType: 'artist',
    date: dateIso,
    projectName,
  });

  return {
    ok: true,
    applied: true,
    preview: { ...preview, id: inserted?.id },
    message: `OS ${inserted?.os_number || osNumber || `#${inserted?.id}`} criada para ${formatBr(dateIso)} — ${projectName}. Complete contrato e cachê em Detalhes Operacionais.`,
  };
}

module.exports = {
  criarOsArtista,
  listarOsArtista,
  gerarOsNumber,
  parseExtraFields,
  slugifyLabel,
};

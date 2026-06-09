/**
 * Subáreas do Highline — espelham os modais Nova/Editar Reserva em /admin/restaurant-reservations.
 * Mesma lista em ReservationModal.tsx e ReservationForm.tsx.
 */

const HIGHLINE_ESTABLISHMENT_ID = Number(process.env.HIGHLINE_ESTABLISHMENT_ID || 7);

/** A partir deste tamanho a casa combina mesas e ainda registra reserva mesmo sem cadeira para todos. */
const HIGHLINE_LARGE_GROUP_MIN = Number(process.env.HIGHLINE_LARGE_GROUP_MIN || 16);

/** Máximo de mesas numa reserva combinada (modal admin não impõe teto rígido; default 20). */
const HIGHLINE_MAX_COMBINED_TABLES = Number(process.env.HIGHLINE_MAX_COMBINED_TABLES || 20);

/** Mesas operacionais sem pacote VIP/camarote (oferta padrão). */
const STANDARD_SUBAREA_KEYS = new Set([
  'deck-frente',
  'deck-esquerdo',
  'deck-direito',
  'bar',
]);

const HIGHLINE_SUBAREAS = [
  {
    key: 'deck-frente',
    area_id: 2,
    label: 'Área Deck - Frente',
    tableNumbers: ['05', '06', '07', '08'],
    defaultCapacity: 4,
    partyHint: '2-6 pessoas',
  },
  {
    key: 'deck-esquerdo',
    area_id: 2,
    label: 'Área Deck - Esquerdo',
    tableNumbers: ['01', '02', '03', '04'],
    defaultCapacity: 4,
    partyHint: '2-6 pessoas',
  },
  {
    key: 'deck-direito',
    area_id: 2,
    label: 'Área Deck - Direito',
    tableNumbers: ['09', '10', '11', '12'],
    defaultCapacity: 4,
    partyHint: '2-6 pessoas',
  },
  {
    key: 'bar',
    area_id: 2,
    label: 'Área Bar',
    tableNumbers: ['15', '16', '17'],
    defaultCapacity: 4,
    partyHint: '2-4 pessoas',
  },
  {
    key: 'roof-direito',
    area_id: 5,
    label: 'Área Rooftop - Direito',
    tableNumbers: ['50', '51', '52', '53', '54', '55'],
    defaultCapacity: 4,
    partyHint: '4-8 pessoas',
  },
  {
    key: 'roof-bistro',
    area_id: 5,
    label: 'Área Rooftop - Bistrô',
    tableNumbers: ['70', '71', '72', '73'],
    defaultCapacity: 4,
    partyHint: '6-8 pessoas',
  },
  {
    key: 'roof-centro',
    area_id: 5,
    label: 'Área Rooftop - Centro',
    tableNumbers: ['44', '45', '46', '47'],
    defaultCapacity: 4,
    partyHint: '4-6 pessoas',
  },
  {
    key: 'roof-esquerdo',
    area_id: 5,
    label: 'Área Rooftop - Esquerdo',
    tableNumbers: ['60', '61', '62', '63', '64', '65'],
    defaultCapacity: 4,
    partyHint: '4-8 pessoas',
  },
  {
    key: 'roof-vista',
    area_id: 5,
    label: 'Área Rooftop - Vista',
    tableNumbers: ['40', '41', '42'],
    defaultCapacity: 4,
    partyHint: '4-6 pessoas',
  },
];

function normalizeLabel(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function isHighlineEstablishment(establishmentId) {
  const id = Number(establishmentId);
  return Number.isFinite(id) && id === HIGHLINE_ESTABLISHMENT_ID;
}

function getHighlineSubareas() {
  return HIGHLINE_SUBAREAS.map((item) => ({ ...item }));
}

function clientAskedPaidVipAreas(text) {
  const normalized = normalizeLabel(text);
  if (!normalized) return false;
  return /\b(camarote|camarotes|vip|bangalo|lounge vip|area vip|consumivel|consumicao minima|pacote vip|valor do camarote|quanto.*camarote)\b/.test(
    normalized
  );
}

function shouldIncludeRooftopInRecommendations({ contextoCliente, areaPreferida, incluirAreasConsumiveis }) {
  if (incluirAreasConsumiveis === true) return true;
  if (clientAskedPaidVipAreas(contextoCliente)) return true;
  if (areaPreferida?.key?.startsWith('roof')) return true;
  const pref = normalizeLabel(areaPreferida?.label || '');
  return pref.includes('rooftop');
}

function resolveHighlineSubarea(input) {
  const normalized = normalizeLabel(input);
  if (!normalized) return null;

  for (const sub of HIGHLINE_SUBAREAS) {
    const labelNorm = normalizeLabel(sub.label);
    const keyNorm = normalizeLabel(sub.key);
    if (normalized === labelNorm || normalized === keyNorm) return sub;
    if (normalized.includes(labelNorm) || labelNorm.includes(normalized)) return sub;
    if (normalized.includes(keyNorm.replace(/-/g, ' '))) return sub;
  }

  const aliases = [
    { match: ['deck frente', 'frente deck'], key: 'deck-frente' },
    { match: ['deck esquerdo', 'esquerdo deck'], key: 'deck-esquerdo' },
    { match: ['deck direito', 'direito deck'], key: 'deck-direito' },
    { match: ['area bar', 'bar'], key: 'bar' },
    { match: ['rooftop direito', 'roof direito'], key: 'roof-direito' },
    { match: ['bistro', 'bistrô', 'bistro rooftop'], key: 'roof-bistro' },
    { match: ['rooftop centro', 'centro rooftop'], key: 'roof-centro' },
    { match: ['rooftop esquerdo', 'esquerdo rooftop'], key: 'roof-esquerdo' },
    { match: ['rooftop vista', 'vista rooftop'], key: 'roof-vista' },
  ];

  for (const alias of aliases) {
    if (alias.match.some((fragment) => normalized.includes(fragment))) {
      return HIGHLINE_SUBAREAS.find((s) => s.key === alias.key) || null;
    }
  }

  return null;
}

const HIGHLINE_AREA_IDS = [...new Set(HIGHLINE_SUBAREAS.map((s) => s.area_id))];

async function loadTablesForAreas(pool, areaIds) {
  if (!areaIds.length) return new Map();
  const result = await pool.query(
    `SELECT id, area_id, table_number, capacity, is_active
       FROM restaurant_tables
      WHERE area_id = ANY($1::int[]) AND is_active = TRUE`,
    [areaIds]
  );
  const byArea = new Map();
  for (const row of result.rows || []) {
    const areaId = Number(row.area_id);
    if (!byArea.has(areaId)) byArea.set(areaId, []);
    byArea.get(areaId).push(row);
  }
  return byArea;
}

/** Mesma regra do modal admin Highline: reserva CONFIRMADA bloqueia a mesa o dia todo. */
async function loadConfirmedReservedByArea(pool, reservationDate, establishmentId) {
  const result = await pool.query(
    `SELECT area_id, table_number
       FROM restaurant_reservations
      WHERE reservation_date = $1
        AND area_id = ANY($2::int[])
        AND (establishment_id = $3 OR establishment_id IS NULL)
        AND UPPER(status) = 'CONFIRMADA'`,
    [reservationDate, HIGHLINE_AREA_IDS, establishmentId]
  );

  const byArea = new Map();
  for (const areaId of HIGHLINE_AREA_IDS) {
    byArea.set(areaId, new Set());
  }
  for (const row of result.rows || []) {
    const areaId = Number(row.area_id);
    if (!byArea.has(areaId)) byArea.set(areaId, new Set());
    const raw = String(row.table_number || '').trim();
    if (!raw) continue;
    raw.split(',').forEach((part) => {
      const num = part.trim();
      if (num) byArea.get(areaId).add(num);
    });
  }
  return byArea;
}

function buildVirtualTables(subarea) {
  return subarea.tableNumbers.map((tableNumber, index) => ({
    id: index + 1,
    area_id: subarea.area_id,
    table_number: tableNumber,
    capacity: subarea.defaultCapacity || 4,
    is_active: true,
  }));
}

function pickBestTable(tables, reservedSet, partySize) {
  const available = tables.filter((table) => {
    const num = String(table.table_number);
    if (reservedSet.has(num)) return false;
    const cap = Number(table.capacity) || 4;
    return cap >= partySize;
  });

  if (available.length === 0) return null;

  available.sort((a, b) => {
    const capA = Number(a.capacity) || 4;
    const capB = Number(b.capacity) || 4;
    const diffA = capA - partySize;
    const diffB = capB - partySize;
    if (diffA !== diffB) return diffA - diffB;
    return String(a.table_number).localeCompare(String(b.table_number), undefined, { numeric: true });
  });

  return available[0];
}

function getSubareasForAreaId(areaId) {
  return HIGHLINE_SUBAREAS.filter((s) => s.area_id === areaId);
}

function computeMaxCombinedTables(partySize) {
  const size = Number(partySize) || 2;
  const needed = Math.ceil(size / 2);
  return Math.min(HIGHLINE_MAX_COMBINED_TABLES, Math.max(6, needed));
}

function capacityForTableNumber(tableNumber, dbTables, subareaByTable) {
  const num = String(tableNumber);
  const db = (dbTables || []).find((t) => String(t.table_number) === num);
  if (db) return Number(db.capacity) || 4;
  const sub = subareaByTable.get(num);
  return sub?.defaultCapacity || 4;
}

function buildSubareaTableIndex(areaId) {
  const subareaByTable = new Map();
  for (const sub of getSubareasForAreaId(areaId)) {
    for (const tn of sub.tableNumbers) {
      subareaByTable.set(String(tn), sub);
    }
  }
  return subareaByTable;
}

function listFreeTablesInSubarea(tables, reservedSet, subarea) {
  const filtered = (tables || []).filter((t) =>
    subarea.tableNumbers.includes(String(t.table_number))
  );
  const source =
    filtered.length > 0 ? filtered : buildVirtualTables(subarea);
  return source
    .filter((t) => !reservedSet.has(String(t.table_number)))
    .map((t) => ({
      table_number: String(t.table_number),
      capacity: Number(t.capacity) || subarea.defaultCapacity || 4,
    }));
}

/**
 * Mesas livres em toda a area_id (Deck, Rooftop, etc.) — espelha o modal admin
 * quando há mesas carregadas da API: o admin pode marcar várias mesas da mesma área.
 */
function listFreeTablesInArea(tablesByArea, reservedByArea, areaId) {
  const reservedSet = reservedByArea.get(areaId) || new Set();
  const dbTables = tablesByArea.get(areaId) || [];
  const subareaByTable = buildSubareaTableIndex(areaId);
  const knownNumbers = [...subareaByTable.keys()];

  return knownNumbers
    .filter((num) => !reservedSet.has(num))
    .map((num) => ({
      table_number: num,
      capacity: capacityForTableNumber(num, dbTables, subareaByTable),
    }));
}

/**
 * Heurística greedy: ordena por capacidade decrescente e soma até atingir o grupo.
 * Para grupos 16+, aceita combinação parcial se não houver cadeiras suficientes.
 */
function pickCombinedTablesFromFreeList(livres, partySize, { maxTables } = {}) {
  const size = Number(partySize);
  if (!Number.isFinite(size) || size <= 0 || !livres?.length) return null;

  const limit = maxTables ?? computeMaxCombinedTables(size);
  const sorted = [...livres].sort((a, b) => {
    if (b.capacity !== a.capacity) return b.capacity - a.capacity;
    return a.table_number.localeCompare(b.table_number, undefined, { numeric: true });
  });

  if (sorted[0].capacity >= size) return null;

  const chosen = [];
  let totalCap = 0;
  for (const t of sorted) {
    if (chosen.length >= limit) break;
    chosen.push(t);
    totalCap += t.capacity;
    if (totalCap >= size) break;
  }

  chosen.sort((a, b) =>
    a.table_number.localeCompare(b.table_number, undefined, { numeric: true })
  );

  const isLargeGroup = size >= HIGHLINE_LARGE_GROUP_MIN;
  if (totalCap >= size) {
    return {
      table_number: chosen.map((t) => t.table_number).join(','),
      table_numbers: chosen.map((t) => t.table_number),
      total_capacity: totalCap,
      mesas_count: chosen.length,
      capacidade_abaixo_do_grupo: false,
    };
  }
  if (isLargeGroup && chosen.length > 0) {
    return {
      table_number: chosen.map((t) => t.table_number).join(','),
      table_numbers: chosen.map((t) => t.table_number),
      total_capacity: totalCap,
      mesas_count: chosen.length,
      capacidade_abaixo_do_grupo: true,
      partial: true,
    };
  }
  return null;
}

/** Combina mesas livres numa subárea (até maxTables). */
function pickCombinedTablesForGroup(tables, reservedSet, subarea, partySize, options = {}) {
  const livres = listFreeTablesInSubarea(tables, reservedSet, subarea);
  return pickCombinedTablesFromFreeList(livres, partySize, options);
}

/** Combina mesas livres em toda a area_id (várias subáreas do painel). */
function pickCombinedTablesForArea(tablesByArea, reservedByArea, areaId, partySize, options = {}) {
  const livres = listFreeTablesInArea(tablesByArea, reservedByArea, areaId);
  return pickCombinedTablesFromFreeList(livres, partySize, options);
}

function scoreSubareaForParty(subarea, hasTable, partySize) {
  let score = hasTable ? 0 : 1000;
  const size = Number(partySize) || 2;

  if (hasTable) {
    if (size <= 4 && (subarea.key.startsWith('deck') || subarea.key === 'bar')) score -= 30;
    if (size <= 3 && subarea.key === 'bar') score -= 15;
    if (STANDARD_SUBAREA_KEYS.has(subarea.key)) score -= 10;
  }

  const order = HIGHLINE_SUBAREAS.findIndex((s) => s.key === subarea.key);
  return score + order * 0.01;
}

function evaluateHighlineSubareaFromCache(subarea, partySize, tablesByArea, reservedByArea) {
  const areaId = subarea.area_id;
  const reservedSet = reservedByArea.get(areaId) || new Set();
  const dbTables = (tablesByArea.get(areaId) || []).filter((t) =>
    subarea.tableNumbers.includes(String(t.table_number))
  );

  let tables = dbTables;
  if (tables.length === 0) {
    tables = buildVirtualTables(subarea);
  }

  const size = Number(partySize) || 2;
  const isLargeGroup = size >= HIGHLINE_LARGE_GROUP_MIN;
  const suggestedTable = pickBestTable(tables, reservedSet, size);
  const combinedSubarea = suggestedTable
    ? null
    : pickCombinedTablesForGroup(tables, reservedSet, subarea, size);
  const combinedArea = suggestedTable
    ? null
    : pickCombinedTablesForArea(tablesByArea, reservedByArea, subarea.area_id, size);

  const freeInSubarea = tables.filter((t) => !reservedSet.has(String(t.table_number))).length;
  const freeInArea = listFreeTablesInArea(tablesByArea, reservedByArea, subarea.area_id).length;
  const areaTotalCapacity = listFreeTablesInArea(
    tablesByArea,
    reservedByArea,
    subarea.area_id
  ).reduce((sum, t) => sum + t.capacity, 0);

  const temMesaParaGrupo = Boolean(
    suggestedTable ||
      combinedSubarea ||
      combinedArea ||
      (isLargeGroup && freeInArea > 0)
  );

  const bestCombo = (() => {
    if (!combinedSubarea && !combinedArea) return null;
    if (combinedArea && !combinedArea.partial) return { combo: combinedArea, escopo: 'area' };
    if (combinedSubarea && !combinedSubarea.partial) return { combo: combinedSubarea, escopo: 'subarea' };
    if (combinedArea && combinedSubarea) {
      return combinedArea.total_capacity >= combinedSubarea.total_capacity
        ? { combo: combinedArea, escopo: 'area' }
        : { combo: combinedSubarea, escopo: 'subarea' };
    }
    if (combinedArea) return { combo: combinedArea, escopo: 'area' };
    return { combo: combinedSubarea, escopo: 'subarea' };
  })();

  let mesaSugerida = null;
  if (suggestedTable) {
    mesaSugerida = {
      table_number: String(suggestedTable.table_number),
      capacity: Number(suggestedTable.capacity) || subarea.defaultCapacity || 4,
      mesas_combinadas: false,
    };
  } else if (bestCombo) {
    mesaSugerida = {
      table_number: bestCombo.combo.table_number,
      capacity: bestCombo.combo.total_capacity,
      mesas_combinadas: true,
      mesas_count: bestCombo.combo.mesas_count,
      escopo_combinacao: bestCombo.escopo,
      capacidade_abaixo_do_grupo: Boolean(bestCombo.combo.capacidade_abaixo_do_grupo),
    };
  } else if (isLargeGroup && freeInArea > 0) {
    const livresArea = listFreeTablesInArea(tablesByArea, reservedByArea, subarea.area_id);
    mesaSugerida = {
      table_number: livresArea.map((t) => t.table_number).join(','),
      capacity: areaTotalCapacity,
      mesas_combinadas: livresArea.length > 1,
      escopo_combinacao: 'area',
      capacidade_abaixo_do_grupo: areaTotalCapacity < size,
    };
  }

  return {
    key: subarea.key,
    label: subarea.label,
    area_id: subarea.area_id,
    party_hint: subarea.partyHint,
    mesas_na_subarea: tables.length,
    mesas_livres: freeInSubarea,
    mesas_livres_na_area: freeInArea,
    capacidade_livre_na_area: areaTotalCapacity,
    grupo_grande: isLargeGroup,
    tem_mesa_para_grupo: temMesaParaGrupo,
    mesa_sugerida: mesaSugerida,
  };
}

async function evaluateHighlineSubarea(pool, subarea, reservationDate, partySize, establishmentId) {
  const tablesByArea = await loadTablesForAreas(pool, [subarea.area_id]);
  const reservedByArea = await loadConfirmedReservedByArea(pool, reservationDate, establishmentId);
  return evaluateHighlineSubareaFromCache(subarea, partySize, tablesByArea, reservedByArea);
}

async function consultHighlineReservationAreas(pool, args = {}) {
  const establishmentId = Number(args.estabelecimento_id);
  const reservationDate = String(args.data || '').slice(0, 10);
  const partySize = Number(args.quantidade_pessoas) || 2;
  const preferred = args.area_preferida ? resolveHighlineSubarea(args.area_preferida) : null;

  if (!isHighlineEstablishment(establishmentId)) {
    return {
      ok: false,
      error: 'consultar_areas_mesa_reserva é exclusivo do estabelecimento Highline.',
    };
  }
  if (!reservationDate) {
    return { ok: false, error: 'Informe data (YYYY-MM-DD) confirmada com o cliente.' };
  }

  const contextoCliente = String(args.contexto_cliente || '').trim();
  const incluirRooftop = shouldIncludeRooftopInRecommendations({
    contextoCliente,
    areaPreferida: preferred,
    incluirAreasConsumiveis: args.incluir_areas_consumiveis,
  });

  const [tablesByArea, reservedByArea] = await Promise.all([
    loadTablesForAreas(pool, HIGHLINE_AREA_IDS),
    loadConfirmedReservedByArea(pool, reservationDate, establishmentId),
  ]);

  const evaluations = HIGHLINE_SUBAREAS.map((subarea) =>
    evaluateHighlineSubareaFromCache(subarea, partySize, tablesByArea, reservedByArea)
  );

  const eligibleForRecommendation = (entry) => {
    if (incluirRooftop) return true;
    return STANDARD_SUBAREA_KEYS.has(entry.key);
  };

  const withVacancy = evaluations.filter(
    (e) => e.tem_mesa_para_grupo && eligibleForRecommendation(e)
  );
  const ranked = [...withVacancy].sort((a, b) => {
    const subA = HIGHLINE_SUBAREAS.find((s) => s.key === a.key);
    const subB = HIGHLINE_SUBAREAS.find((s) => s.key === b.key);
    return (
      scoreSubareaForParty(subA, true, partySize) - scoreSubareaForParty(subB, true, partySize)
    );
  });

  let recommended = ranked[0] || null;
  if (preferred) {
    const preferredEval = evaluations.find((e) => e.key === preferred.key);
    if (preferredEval?.tem_mesa_para_grupo) {
      recommended = preferredEval;
    } else if (ranked.length > 0) {
      recommended = ranked[0];
    }
  }

  const alternativas = ranked
    .filter((e) => e.key !== recommended?.key)
    .map((e) => e.label)
    .slice(0, 4);

  const isLargeGroup = partySize >= HIGHLINE_LARGE_GROUP_MIN;
  const operacionaisComMesaLivre = evaluations.filter(
    (e) => e.mesas_livres > 0 && eligibleForRecommendation(e)
  );
  const todasCheiasOperacionais = isLargeGroup
    ? operacionaisComMesaLivre.length === 0
    : withVacancy.length === 0;
  const todasCheias =
    todasCheiasOperacionais &&
    (!incluirRooftop ||
      (isLargeGroup
        ? evaluations.filter((e) => e.mesas_livres > 0).length === 0
        : evaluations.filter((e) => e.tem_mesa_para_grupo).length === 0));

  if (isLargeGroup && !recommended && operacionaisComMesaLivre.length > 0) {
    recommended = [...operacionaisComMesaLivre].sort(
      (a, b) =>
        (b.capacidade_livre_na_area || 0) - (a.capacidade_livre_na_area || 0) ||
        (b.mesas_livres_na_area || 0) - (a.mesas_livres_na_area || 0)
    )[0];
  }

  return {
    ok: true,
    estabelecimento_id: establishmentId,
    reservation_date: reservationDate,
    quantidade_pessoas: partySize,
    grupo_grande: isLargeGroup,
    fonte: 'admin/restaurant-reservations (subáreas e mesas dos modais Nova/Editar Reserva)',
    area_preferida_informada: preferred?.label || null,
    oferta_apenas_mesas_operacionais: !incluirRooftop,
    nota_camarotes:
      !incluirRooftop
        ? 'Camarotes e pacotes VIP/consumíveis: só ofereça se o cliente perguntar sobre camarotes (consultar_faq areas_mesas_camarotes_diferenca).'
        : null,
    todas_areas_cheias: todasCheias,
    area_recomendada: recommended
      ? {
          label: recommended.label,
          area_id: recommended.area_id,
          mesa_sugerida: recommended.mesa_sugerida,
        }
      : null,
    alternativas_com_vaga: alternativas,
    areas: evaluations,
    proximo_passo: todasCheias
      ? 'Chamar criar_lista_espera e explicar que a Equipe de Hostess alocará quando houver mesa.'
      : recommended
        ? isLargeGroup
          ? 'Grupo grande: o backend combina várias mesas numa única reserva (como "Reservar múltiplas mesas" no painel), inclusive mesas de subáreas diferentes na mesma área (Deck/Rooftop). REGISTRE com criar_pre_reserva. Consulte reserva_grupos_grandes_highline na Base.'
          : 'Confirmar área com o cliente e seguir com criar_pre_reserva (informar area com o label da subárea).'
        : null,
  };
}

async function findAvailableTableInSubarea(pool, subarea, reservationDate, partySize, establishmentId) {
  const evaluation = await evaluateHighlineSubarea(
    pool,
    subarea,
    reservationDate,
    partySize,
    establishmentId
  );
  return evaluation.mesa_sugerida
    ? {
        area_id: subarea.area_id,
        table_number: evaluation.mesa_sugerida.table_number,
        label: subarea.label,
      }
    : null;
}

function formatCombinedTablesResult(combo, { areaId, label, escopo }) {
  if (!combo) return null;
  return {
    area_id: areaId,
    label,
    table_number: combo.table_number,
    table_numbers: combo.table_numbers,
    total_capacity: combo.total_capacity,
    mesas_count: combo.mesas_count,
    escopo_combinacao: escopo,
    partial: Boolean(combo.partial),
    capacidade_abaixo_do_grupo: Boolean(combo.capacidade_abaixo_do_grupo),
  };
}

function pickBestCombinedForParty(tablesByArea, reservedByArea, subarea, partySize, options = {}) {
  const reservedSet = reservedByArea.get(subarea.area_id) || new Set();
  let tables = (tablesByArea.get(subarea.area_id) || []).filter((t) =>
    subarea.tableNumbers.includes(String(t.table_number))
  );
  if (tables.length === 0) {
    tables = buildVirtualTables(subarea);
  }

  const singleFits = pickBestTable(tables, reservedSet, partySize);
  if (singleFits) return null;

  const subareaCombo = pickCombinedTablesForGroup(tables, reservedSet, subarea, partySize, options);
  if (subareaCombo && !subareaCombo.partial) {
    return formatCombinedTablesResult(subareaCombo, {
      areaId: subarea.area_id,
      label: subarea.label,
      escopo: 'subarea',
    });
  }

  const areaCombo = pickCombinedTablesForArea(
    tablesByArea,
    reservedByArea,
    subarea.area_id,
    partySize,
    options
  );
  if (areaCombo) {
    const escopo = areaCombo.mesas_count > (subareaCombo?.mesas_count || 0) ? 'area' : 'subarea';
    const chosen = escopo === 'area' ? areaCombo : subareaCombo;
    if (!chosen) return null;
    return formatCombinedTablesResult(chosen, {
      areaId: subarea.area_id,
      label: subarea.label,
      escopo,
    });
  }

  if (subareaCombo) {
    return formatCombinedTablesResult(subareaCombo, {
      areaId: subarea.area_id,
      label: subarea.label,
      escopo: 'subarea',
    });
  }

  return null;
}

/**
 * Combina múltiplas mesas quando nenhuma mesa única comporta o grupo.
 * Espelha o modal admin "Reservar múltiplas mesas": table_number "5,6,7".
 * Primeiro tenta na subárea; se insuficiente, combina em toda a area_id (Deck/Rooftop).
 */
async function findCombinedTablesInSubareaForGroup(
  pool,
  subarea,
  reservationDate,
  partySize,
  establishmentId,
  options = {}
) {
  if (!subarea || !Number.isFinite(Number(partySize)) || partySize <= 0) return null;

  const tablesByArea = await loadTablesForAreas(pool, [subarea.area_id]);
  const reservedByArea = await loadConfirmedReservedByArea(
    pool,
    reservationDate,
    establishmentId
  );

  return pickBestCombinedForParty(tablesByArea, reservedByArea, subarea, partySize, options);
}

/** Combina mesas livres em toda a area_id (todas as subáreas do painel na mesma área). */
async function findCombinedTablesInAreaForGroup(
  pool,
  areaId,
  reservationDate,
  partySize,
  establishmentId,
  { label = null } = {}
) {
  const id = Number(areaId);
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(Number(partySize)) || partySize <= 0) {
    return null;
  }

  const tablesByArea = await loadTablesForAreas(pool, [id]);
  const reservedByArea = await loadConfirmedReservedByArea(
    pool,
    reservationDate,
    establishmentId
  );

  const combo = pickCombinedTablesForArea(tablesByArea, reservedByArea, id, partySize);
  if (!combo) return null;

  const areaLabel =
    label ||
    (id === 2 ? 'Área Deck (combinada)' : id === 5 ? 'Área Rooftop (combinada)' : `Área ${id}`);

  return formatCombinedTablesResult(combo, {
    areaId: id,
    label: areaLabel,
    escopo: 'area',
  });
}

module.exports = {
  HIGHLINE_ESTABLISHMENT_ID,
  HIGHLINE_LARGE_GROUP_MIN,
  HIGHLINE_SUBAREAS,
  STANDARD_SUBAREA_KEYS,
  isHighlineEstablishment,
  getHighlineSubareas,
  clientAskedPaidVipAreas,
  resolveHighlineSubarea,
  consultHighlineReservationAreas,
  findAvailableTableInSubarea,
  findCombinedTablesInSubareaForGroup,
  findCombinedTablesInAreaForGroup,
  evaluateHighlineSubarea,
  evaluateHighlineSubareaFromCache,
  pickCombinedTablesFromFreeList,
  pickCombinedTablesForArea,
};

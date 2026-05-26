/**
 * Subáreas do Highline — espelham os modais Nova/Editar Reserva em /admin/restaurant-reservations.
 * Mesma lista em ReservationModal.tsx e ReservationForm.tsx.
 */

const HIGHLINE_ESTABLISHMENT_ID = Number(process.env.HIGHLINE_ESTABLISHMENT_ID || 7);

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

  const suggestedTable = pickBestTable(tables, reservedSet, partySize);
  const freeCount = tables.filter((t) => !reservedSet.has(String(t.table_number))).length;

  return {
    key: subarea.key,
    label: subarea.label,
    area_id: subarea.area_id,
    party_hint: subarea.partyHint,
    mesas_na_subarea: tables.length,
    mesas_livres: freeCount,
    tem_mesa_para_grupo: Boolean(suggestedTable),
    mesa_sugerida: suggestedTable
      ? {
          table_number: String(suggestedTable.table_number),
          capacity: Number(suggestedTable.capacity) || subarea.defaultCapacity || 4,
        }
      : null,
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

  const todasCheiasOperacionais = withVacancy.length === 0;
  const todasCheias =
    todasCheiasOperacionais &&
    (!incluirRooftop ||
      evaluations.filter((e) => e.tem_mesa_para_grupo).length === 0);

  return {
    ok: true,
    estabelecimento_id: establishmentId,
    reservation_date: reservationDate,
    quantidade_pessoas: partySize,
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
        ? 'Confirmar área com o cliente e seguir com criar_pre_reserva (informar area com o label da subárea).'
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

/**
 * Combina múltiplas mesas livres na mesma subárea quando nenhuma mesa
 * individual comporta o grupo. Usa o mesmo formato do modal admin "Reservar
 * múltiplas mesas" do /admin/restaurant-reservations: o table_number final
 * é a string de mesas concatenadas por vírgula (ex.: "5,6,7").
 *
 * Retorna null se:
 *   - já existe mesa única que comporta o grupo (use findAvailableTableInSubarea);
 *   - não há mesas livres suficientes para o grupo na subárea;
 *   - a subárea não tem mesas físicas no painel (só virtuais).
 *
 * Heurística: ordena mesas livres por capacidade decrescente e vai somando
 * até comportar partySize. Limita a 6 mesas por reserva para não criar combos
 * absurdos — acima disso é caso de handoff humano.
 */
async function findCombinedTablesInSubareaForGroup(
  pool,
  subarea,
  reservationDate,
  partySize,
  establishmentId,
  { maxTables = 6 } = {}
) {
  if (!subarea || !Number.isFinite(Number(partySize)) || partySize <= 0) return null;

  const tablesByArea = await loadTablesForAreas(pool, [subarea.area_id]);
  const reservedByArea = await loadConfirmedReservedByArea(
    pool,
    reservationDate,
    establishmentId
  );

  const reservedSet = reservedByArea.get(subarea.area_id) || new Set();
  let tables = (tablesByArea.get(subarea.area_id) || []).filter((t) =>
    subarea.tableNumbers.includes(String(t.table_number))
  );
  if (tables.length === 0) {
    tables = buildVirtualTables(subarea);
  }

  const livres = tables
    .filter((t) => !reservedSet.has(String(t.table_number)))
    .map((t) => ({
      table_number: String(t.table_number),
      capacity: Number(t.capacity) || subarea.defaultCapacity || 4,
    }));

  if (livres.length === 0) return null;

  livres.sort((a, b) => {
    if (b.capacity !== a.capacity) return b.capacity - a.capacity;
    return a.table_number.localeCompare(b.table_number, undefined, { numeric: true });
  });

  if (livres[0].capacity >= partySize) return null;

  const chosen = [];
  let totalCap = 0;
  for (const t of livres) {
    if (chosen.length >= maxTables) break;
    chosen.push(t);
    totalCap += t.capacity;
    if (totalCap >= partySize) break;
  }

  if (totalCap < partySize) return null;

  chosen.sort((a, b) =>
    a.table_number.localeCompare(b.table_number, undefined, { numeric: true })
  );

  return {
    area_id: subarea.area_id,
    label: subarea.label,
    table_number: chosen.map((t) => t.table_number).join(','),
    table_numbers: chosen.map((t) => t.table_number),
    capacities: chosen.map((t) => t.capacity),
    total_capacity: totalCap,
    mesas_count: chosen.length,
  };
}

module.exports = {
  HIGHLINE_ESTABLISHMENT_ID,
  HIGHLINE_SUBAREAS,
  STANDARD_SUBAREA_KEYS,
  isHighlineEstablishment,
  getHighlineSubareas,
  clientAskedPaidVipAreas,
  resolveHighlineSubarea,
  consultHighlineReservationAreas,
  findAvailableTableInSubarea,
  findCombinedTablesInSubareaForGroup,
  evaluateHighlineSubarea,
};

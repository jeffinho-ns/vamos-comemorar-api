/**
 * Subáreas do Highline — espelham os modais Nova/Editar Reserva em /admin/restaurant-reservations.
 * Mesma lista em ReservationModal.tsx e ReservationForm.tsx.
 */

const HIGHLINE_ESTABLISHMENT_ID = Number(process.env.HIGHLINE_ESTABLISHMENT_ID || 7);

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

async function loadTablesForArea(pool, areaId) {
  const result = await pool.query(
    `SELECT id, area_id, table_number, capacity, is_active
       FROM restaurant_tables
      WHERE area_id = $1 AND is_active = TRUE
      ORDER BY CAST(table_number AS INTEGER) ASC, table_number ASC`,
    [areaId]
  );
  return result.rows || [];
}

/** Mesma regra do modal admin Highline: reserva CONFIRMADA bloqueia a mesa o dia todo. */
async function loadConfirmedReservedTableNumbers(pool, areaId, reservationDate, establishmentId) {
  const result = await pool.query(
    `SELECT table_number
       FROM restaurant_reservations
      WHERE reservation_date = $1
        AND area_id = $2
        AND (establishment_id = $3 OR establishment_id IS NULL)
        AND UPPER(status) = 'CONFIRMADA'`,
    [reservationDate, areaId, establishmentId]
  );

  const reserved = new Set();
  for (const row of result.rows || []) {
    const raw = String(row.table_number || '').trim();
    if (!raw) continue;
    raw.split(',').forEach((part) => {
      const num = part.trim();
      if (num) reserved.add(num);
    });
  }
  return reserved;
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
    if (size >= 6 && size <= 8 && subarea.key.startsWith('roof')) score -= 25;
    if (size >= 7 && subarea.key === 'roof-bistro') score -= 35;
    if (size <= 3 && subarea.key === 'bar') score -= 15;
  }

  const order = HIGHLINE_SUBAREAS.findIndex((s) => s.key === subarea.key);
  return score + order * 0.01;
}

async function evaluateHighlineSubarea(pool, subarea, reservationDate, partySize, establishmentId) {
  const dbTables = await loadTablesForArea(pool, subarea.area_id);
  const reservedSet = await loadConfirmedReservedTableNumbers(
    pool,
    subarea.area_id,
    reservationDate,
    establishmentId
  );

  let tables = dbTables.filter((t) =>
    subarea.tableNumbers.includes(String(t.table_number))
  );
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

  const evaluations = [];
  for (const subarea of HIGHLINE_SUBAREAS) {
    evaluations.push(
      await evaluateHighlineSubarea(pool, subarea, reservationDate, partySize, establishmentId)
    );
  }

  const withVacancy = evaluations.filter((e) => e.tem_mesa_para_grupo);
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

  const todasCheias = withVacancy.length === 0;

  return {
    ok: true,
    estabelecimento_id: establishmentId,
    reservation_date: reservationDate,
    quantidade_pessoas: partySize,
    fonte: 'admin/restaurant-reservations (subáreas e mesas dos modais Nova/Editar Reserva)',
    area_preferida_informada: preferred?.label || null,
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

module.exports = {
  HIGHLINE_ESTABLISHMENT_ID,
  HIGHLINE_SUBAREAS,
  isHighlineEstablishment,
  getHighlineSubareas,
  resolveHighlineSubarea,
  consultHighlineReservationAreas,
  findAvailableTableInSubarea,
  evaluateHighlineSubarea,
};

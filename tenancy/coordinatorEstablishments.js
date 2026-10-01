'use strict';

const COORDINATOR_EMAIL = 'coordenadora.reservas@ideiaum.com.br';

/** places.id operacionais do grupo que a coordenadora de reservas administra. */
const COORDINATOR_PLACE_IDS = [
  1, // Seu Justino
  7, // Highline
  8, // Pracinha do Seu Justino
  9, // Reserva Rooftop
  21, // Reserva Pinheiros
];

const PLACE_NAMES = {
  1: 'Seu Justino',
  7: 'Highline',
  8: 'Pracinha do Seu Justino',
  9: 'Reserva Rooftop',
  21: 'Reserva Pinheiros',
};

function isCoordinatorEmail(email) {
  return String(email || '').trim().toLowerCase() === COORDINATOR_EMAIL;
}

function normalizeNameSql(column) {
  return `lower(translate(COALESCE(${column}, ''), 'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç', 'AAAAEEIOOUCaaaaeeiooouc'))`;
}

/**
 * IDs fixos das cinco casas conhecidas, mais o Apê do Pracinha quando o
 * cadastro existir (o id não é estável no código).
 * @returns {Promise<Array<{ id: number, name: string }>>}
 */
async function loadCoordinatorPlaces(pool) {
  const byId = new Map(
    COORDINATOR_PLACE_IDS.map((id) => [id, PLACE_NAMES[id]]),
  );

  const apePlaceSql = `
    SELECT id, name
      FROM places
     WHERE ${normalizeNameSql('name')} LIKE '%ape%pracinha%'
        OR lower(COALESCE(slug, '')) LIKE '%ape%pracinha%'`;

  const apeEstablishmentSql = `
    SELECT legacy_place_id AS id, name
      FROM meu_backup_db.establishments
     WHERE legacy_place_id IS NOT NULL
       AND (
         ${normalizeNameSql('name')} LIKE '%ape%pracinha%'
         OR lower(COALESCE(slug, '')) LIKE '%ape%pracinha%'
       )`;

  for (const sql of [apePlaceSql, apeEstablishmentSql]) {
    try {
      const { rows } = await pool.query(sql);
      for (const row of rows) {
        const id = Number(row.id);
        if (!Number.isFinite(id) || id <= 0) continue;
        const name = String(row.name || '').trim();
        if (!byId.has(id) || (name && !PLACE_NAMES[id])) byId.set(id, name || byId.get(id));
        if (name) byId.set(id, name);
      }
    } catch (_) {
      /* tabela ausente em teste/staging */
    }
  }

  return [...byId.entries()].map(([id, name]) => ({
    id,
    name: name || `Estabelecimento ${id}`,
  }));
}

module.exports = {
  COORDINATOR_EMAIL,
  COORDINATOR_PLACE_IDS,
  isCoordinatorEmail,
  loadCoordinatorPlaces,
};

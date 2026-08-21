'use strict';

/**
 * Justino360 — acesso a setores impactados de eventos do calendário.
 * Isolado da rota para manter `routes/justino360/calendar.js` enxuta e para
 * garantir que todo id de setor seja validado contra o próprio estabelecimento.
 */

const { parseId } = require('../../validators/justino360Validator');

const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 365;

/** Setores impactados por padrão quando o gestor não escolhe nenhum. */
const DEFAULT_IMPACT_KEYS = ['gerencia', 'salao', 'bar', 'cozinha', 'caixa', 'limpeza'];

/** Subselect reaproveitado: nomes dos setores impactados junto com o evento. */
const IMPACT_SECTORS_JSON = `COALESCE((
  SELECT json_agg(json_build_object('id', s.id, 'key', s.key, 'name', s.name)
                  ORDER BY s.sort_order, s.name)
    FROM j360_sectors s
   WHERE s.id = ANY(e.impact_sector_ids)
     AND s.establishment_id = e.establishment_id
), '[]'::json) AS impact_sectors`;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function parseWindowDays(value) {
  const days = Number(value);
  if (!Number.isFinite(days) || days <= 0) return DEFAULT_WINDOW_DAYS;
  return Math.min(Math.trunc(days), MAX_WINDOW_DAYS);
}

/**
 * Resolve os setores impactados de um evento. Só aceita ids do próprio
 * estabelecimento (evita vazar setor de outra casa) e cai no conjunto padrão
 * quando a lista vem vazia.
 * @returns {Promise<Array<{id: number, key: string, name: string}>>}
 */
async function resolveImpactSectors(pool, establishmentId, rawIds) {
  const wanted = Array.isArray(rawIds) ? rawIds.map(parseId).filter(Boolean) : [];
  if (wanted.length > 0) {
    const { rows } = await pool.query(
      `SELECT id, key, name FROM j360_sectors
        WHERE establishment_id = $1 AND id = ANY($2) AND is_active = TRUE
        ORDER BY sort_order, name`,
      [establishmentId, wanted]
    );
    return rows;
  }
  const { rows } = await pool.query(
    `SELECT id, key, name FROM j360_sectors
      WHERE establishment_id = $1 AND key = ANY($2) AND is_active = TRUE
      ORDER BY sort_order, name`,
    [establishmentId, DEFAULT_IMPACT_KEYS]
  );
  return rows;
}

/** Setores de um evento já salvo — usado para recalcular briefing no PATCH. */
async function loadSectorsByIds(pool, establishmentId, ids) {
  const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (list.length === 0) return [];
  const { rows } = await pool.query(
    `SELECT id, key, name FROM j360_sectors
      WHERE establishment_id = $1 AND id = ANY($2)
      ORDER BY sort_order, name`,
    [establishmentId, list]
  );
  return rows;
}

/** Chave do setor consultado, para montar o impacto individual na listagem. */
async function loadSectorKey(pool, establishmentId, sectorId) {
  if (!sectorId) return null;
  const { rows } = await pool.query(
    `SELECT key FROM j360_sectors WHERE id = $1 AND establishment_id = $2`,
    [sectorId, establishmentId]
  );
  return rows[0]?.key || null;
}

module.exports = {
  DEFAULT_IMPACT_KEYS,
  IMPACT_SECTORS_JSON,
  todayISO,
  parseWindowDays,
  resolveImpactSectors,
  loadSectorsByIds,
  loadSectorKey,
};

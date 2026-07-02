'use strict';

/**
 * Executa query com variáveis de sessão para RLS (SET LOCAL dentro de transação).
 */

const { isRlsEnforced } = require('./featureFlags');

const RESERVATIONS_TABLE_RE = /\brestaurant_reservations\b/i;

function targetsRestaurantReservations(sql) {
  return RESERVATIONS_TABLE_RE.test(String(sql || ''));
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ organizationId?: number|null, isAdmin?: boolean }} ctx
 * @param {string} text
 * @param {any[]} params
 */
async function queryWithRlsContext(pool, ctx, text, params) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (ctx.isAdmin) {
      await client.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
    } else if (ctx.organizationId) {
      await client.query(`SELECT set_config('app.current_org', $1, true)`, [
        String(ctx.organizationId),
      ]);
    }
    const result = await client.query(text, params);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ organizationId?: number|null, isAdmin?: boolean }|null} ctx
 * @param {string} text
 * @param {any[]} params
 * @param {Function} originalQuery bound pool.query
 */
async function maybeScopedQuery(pool, ctx, text, params, originalQuery) {
  if (!isRlsEnforced() || !ctx || !targetsRestaurantReservations(text)) {
    return originalQuery(text, params);
  }
  if (!ctx.isAdmin && !ctx.organizationId) {
    return originalQuery(text, params);
  }
  return queryWithRlsContext(pool, ctx, text, params);
}

module.exports = {
  targetsRestaurantReservations,
  queryWithRlsContext,
  maybeScopedQuery,
};

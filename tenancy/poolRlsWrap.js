'use strict';

/**
 * Envolve pool.query para aplicar RLS em restaurant_reservations quando
 * SAAS_RLS_MODE=on e há contexto de tenant no AsyncLocalStorage.
 */

const { isRlsEnforced } = require('./featureFlags');
const { getRequestTenant } = require('./requestContext');
const { maybeScopedQuery } = require('./scopedQuery');

function wrapPoolWithTenantRls(pool) {
  if (!isRlsEnforced()) return;

  const originalQuery = pool.query.bind(pool);

  pool.query = function patchedQuery(text, params, callback) {
    const ctx = getRequestTenant();

    const execute = () => maybeScopedQuery(pool, ctx, text, params, originalQuery);

    if (typeof callback === 'function') {
      execute()
        .then((result) => callback(null, result))
        .catch((err) => callback(err));
      return;
    }

    return execute();
  };
}

module.exports = { wrapPoolWithTenantRls };

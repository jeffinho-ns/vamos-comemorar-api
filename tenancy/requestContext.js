'use strict';

/**
 * Contexto de tenant por request (AsyncLocalStorage).
 * Permite que pool.query aplique SET LOCAL app.current_org sem passar req
 * em cada handler.
 */

const { AsyncLocalStorage } = require('async_hooks');

const tenantStorage = new AsyncLocalStorage();

/**
 * @typedef {{ organizationId: number|null, isAdmin: boolean, userId?: number }} RequestTenantContext
 */

function runWithRequestTenant(ctx, next) {
  return tenantStorage.run(ctx, () => next());
}

function getRequestTenant() {
  return tenantStorage.getStore() || null;
}

module.exports = { runWithRequestTenant, getRequestTenant };

'use strict';

/**
 * Feature flags do modo SaaS multi-tenant.
 *
 * Tudo OFF por padrão. Enquanto SAAS_MODE não for 'on', todos os middlewares
 * de tenancy operam em FAIL-OPEN (não bloqueiam nada) — 100% seguro para a
 * produção atual.
 *
 * Estados de SAAS_MODE:
 *   - (vazio) / 'off' : tenancy desligada, fail-open total.
 *   - 'observe'       : NÃO bloqueia, mas LOGA o que SERIA bloqueado (modo
 *                       observação do plano — usar por dias antes de ligar).
 *   - 'on'            : enforcement real (só ligar após backfill + staging).
 */

function saasMode() {
  return String(process.env.SAAS_MODE || 'off').toLowerCase();
}

function isSaasEnforced() {
  return saasMode() === 'on';
}

function isSaasObserving() {
  return saasMode() === 'observe';
}

/** true quando estamos apenas observando ou totalmente desligados (não bloquear). */
function isFailOpen() {
  return !isSaasEnforced();
}

module.exports = { saasMode, isSaasEnforced, isSaasObserving, isFailOpen };

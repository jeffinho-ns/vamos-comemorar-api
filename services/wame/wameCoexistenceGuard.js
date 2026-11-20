'use strict';

/**
 * Proteção de coexistência oficial Meta vs QR.
 * Bloqueia por padrão operações destrutivas em casas protegidas.
 * Não reconecta, não onborda e não chama APIs de sessão Wame.
 */

const {
  getCoexistenceFlags,
  shouldProtectSession,
  shouldBlockPhoneLineAdmin,
  shouldSuspendSolOutbound,
} = require('./wameCoexistenceFlags');
const { auditSensitiveOp } = require('./wameSensitiveOpAudit');

const DESTRUCTIVE_SESSION_OPS = new Set([
  'official_sync',
  'import_history',
  'instance_restart',
  'instance_logout',
  'instance_delete',
  'instance_resync',
  'official_deregister',
  'official_register',
  'pairing',
  'reconnect',
]);

const PHONE_LINE_ADMIN_OPS = new Set([
  'phone_line_upsert',
  'phone_line_disconnect',
]);

/** APIs Wame de sessão que este repo NÃO deve chamar automaticamente. */
const WAME_SESSION_APIS_NOT_WRAPPED = [
  'DELETE /{key}/instance',
  'POST /{key}/instance/restart',
  'POST /{key}/instance/resync',
  'POST /{key}/instance/official/deregister',
  'POST /{key}/instance/official/register',
  'POST /{key}/instance/pairing-code',
  'PUT /{key}/instance/status',
  'POST /{key}/instance/web-session',
];

/** Usado no código/handoff; ausente do swagger público consultado em 2026-11-20. */
const WAME_OFFICIAL_SYNC_NOTE =
  'POST|GET /{key}/instance/official/sync — usado em wameService/whatsappAdmin; não listado no swagger.json público da Wame na auditoria.';

function detectIntegrationTypeFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return 'unknown';
  if (payload.official === false) return 'qr_unofficial';
  if (payload.official === true) return 'official';
  const field = String(payload?.entry?.[0]?.changes?.[0]?.field || '');
  if (field === 'history' || field === 'smb_app_state_sync' || field === 'smb_message_echoes') {
    return 'official_coexistence_signals';
  }
  return 'unknown';
}

function readExplicitAuthorization(req) {
  if (!req || typeof req !== 'object') {
    return { authorized: false, reason: null };
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const headerConfirm = String(req.headers?.['x-wame-confirm-destructive'] || '').trim();
  const bodyConfirm =
    body.confirm_destructive === true ||
    String(body.confirm_destructive || '').toLowerCase() === 'true';
  const reason = String(
    body.destructive_reason || headerConfirm || body.confirm_reason || '',
  ).trim();

  if ((bodyConfirm || headerConfirm) && reason.length >= 8) {
    return { authorized: true, reason: reason.slice(0, 200) };
  }
  return { authorized: false, reason: reason || null };
}

function buildBlockedError(op, establishmentId, flags) {
  const error = new Error(
    `Operação "${op}" bloqueada para establishment_id=${establishmentId} (coexistência protegida). ` +
      'Envie confirm_destructive=true e destructive_reason (>=8 chars) ou header X-Wame-Confirm-Destructive.',
  );
  error.statusCode = 403;
  error.code = 'WAME_COEXISTENCE_BLOCKED';
  error.op = op;
  error.establishmentId = establishmentId;
  error.flags = flags;
  return error;
}

/**
 * @returns {{ allowed: true, flags: object|null, explicitAuth: object } | never}
 * @throws Error com statusCode 403 quando bloqueado
 */
function assertSensitiveOpAllowed({
  op,
  establishmentId,
  req = null,
  actorUserId = null,
} = {}) {
  const operation = String(op || '').trim();
  const id = Number(establishmentId);
  const flags = getCoexistenceFlags(id);
  const explicitAuth = readExplicitAuthorization(req);

  const needsSessionGuard =
    DESTRUCTIVE_SESSION_OPS.has(operation) && shouldProtectSession(id);
  const needsPhoneGuard =
    PHONE_LINE_ADMIN_OPS.has(operation) && shouldBlockPhoneLineAdmin(id);

  if (!needsSessionGuard && !needsPhoneGuard) {
    return { allowed: true, flags, explicitAuth };
  }

  if (explicitAuth.authorized) {
    auditSensitiveOp({
      op: operation,
      establishmentId: id,
      outcome: 'allowed_with_explicit_auth',
      actorUserId,
      reason: explicitAuth.reason,
      detail: { flags },
    });
    return { allowed: true, flags, explicitAuth };
  }

  auditSensitiveOp({
    op: operation,
    establishmentId: id,
    outcome: 'blocked',
    actorUserId,
    reason: explicitAuth.reason,
    detail: { flags },
  });
  throw buildBlockedError(operation, id, flags);
}

function observeConnectionEvent({
  establishmentId = null,
  payload = null,
  integrationType = null,
} = {}) {
  const change = payload?.entry?.[0]?.changes?.[0] || null;
  const value = change?.value && typeof change.value === 'object' ? change.value : {};
  const status =
    value.status ||
    value.state ||
    value.connection ||
    value.event ||
    null;

  auditSensitiveOp({
    op: 'webhook_connection',
    establishmentId,
    outcome: 'observed',
    detail: {
      integrationType:
        integrationType || detectIntegrationTypeFromPayload(payload),
      field: change?.field || 'connection',
      status: status ? String(status).slice(0, 80) : null,
      official:
        typeof payload?.official === 'boolean' ? payload.official : null,
      // Sem telefone, wa_id, tokens ou conteúdo.
    },
  });
}

function getSessionApiInventory() {
  return {
    wrappedInThisRepo: [
      'POST /{key}/message/text',
      'POST /{key}/instance/official/sync (handoff; ver nota)',
      'GET /{key}/instance/official/sync (handoff; ver nota)',
    ],
    notWrappedDoNotAutoCall: WAME_SESSION_APIS_NOT_WRAPPED,
    officialSyncNote: WAME_OFFICIAL_SYNC_NOTE,
    webhookFieldsObserved: [
      'messages',
      'history',
      'smb_message_echoes',
      'smb_app_state_sync',
      'presence',
      'connection',
    ],
  };
}

module.exports = {
  DESTRUCTIVE_SESSION_OPS,
  PHONE_LINE_ADMIN_OPS,
  WAME_SESSION_APIS_NOT_WRAPPED,
  detectIntegrationTypeFromPayload,
  readExplicitAuthorization,
  assertSensitiveOpAllowed,
  observeConnectionEvent,
  getSessionApiInventory,
  shouldSuspendSolOutbound,
  shouldProtectSession,
  shouldBlockPhoneLineAdmin,
  getCoexistenceFlags,
};

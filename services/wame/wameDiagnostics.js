'use strict';

/**
 * Observabilidade Wame/Meta — logs estruturados sem tokens, PII ou corpo de mensagem.
 * Não altera roteamento; use nos pontos de integração quando Backend/Meta autorizarem o wiring.
 */

const SAFE_EVENT_RE = /^[a-z][a-z0-9_.-]{1,64}$/i;

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function maskPhone(value) {
  const digits = digitsOnly(value);
  if (!digits) return null;
  if (digits.length <= 4) return '••••';
  return `••••${digits.slice(-4)}`;
}

function maskId(value, { keep = 4 } = {}) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.length <= keep) return '••••';
  return `••••${raw.slice(-keep)}`;
}

function sanitizeStatus(status) {
  const n = Number(status);
  return Number.isFinite(n) ? n : null;
}

/**
 * Monta um objeto de log seguro. Campos sensíveis são mascarados ou omitidos.
 * Aceita apenas chaves allowlisted em `fields`.
 */
function buildWameLog(event, fields = {}) {
  const name = String(event || '').trim();
  if (!SAFE_EVENT_RE.test(name)) {
    throw new Error('Evento de diagnóstico Wame inválido.');
  }

  const out = {
    scope: 'wame',
    event: name,
    ts: new Date().toISOString(),
  };

  if (fields.establishmentId != null) {
    const id = Number(fields.establishmentId);
    if (Number.isFinite(id) && id > 0) out.establishmentId = id;
  }
  if (fields.instanceId) out.instanceIdHint = maskId(fields.instanceId, { keep: 6 });
  if (fields.waId) out.waIdHint = maskPhone(fields.waId);
  if (fields.displayPhone) out.displayPhoneHint = maskPhone(fields.displayPhone);
  if (fields.wamid) out.wamidHint = maskId(fields.wamid, { keep: 8 });
  if (fields.server) {
    try {
      out.serverHost = new URL(String(fields.server)).host;
    } catch {
      out.serverHost = 'invalid';
    }
  }
  if (fields.status != null) out.status = sanitizeStatus(fields.status);
  if (fields.durationMs != null) {
    const ms = Number(fields.durationMs);
    if (Number.isFinite(ms) && ms >= 0) out.durationMs = Math.round(ms);
  }
  if (fields.duplicate === true) out.duplicate = true;
  if (fields.retryable === true) out.retryable = true;
  if (fields.reason) {
    const reason = String(fields.reason).slice(0, 80).replace(/[^\w.:-]+/g, '_');
    if (reason) out.reason = reason;
  }
  if (fields.outcome) {
    const outcome = String(fields.outcome).slice(0, 40).replace(/[^\w.-]+/g, '_');
    if (outcome) out.outcome = outcome;
  }

  return out;
}

function logWame(level, event, fields = {}) {
  const payload = buildWameLog(event, fields);
  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
  return payload;
}

function correlationHints({ establishmentId, instanceId, wamid, waId } = {}) {
  return {
    establishmentId: establishmentId != null ? Number(establishmentId) : null,
    instanceIdHint: instanceId ? maskId(instanceId, { keep: 6 }) : null,
    wamidHint: wamid ? maskId(wamid, { keep: 8 }) : null,
    waIdHint: waId ? maskPhone(waId) : null,
  };
}

module.exports = {
  maskPhone,
  maskId,
  buildWameLog,
  logWame,
  correlationHints,
};

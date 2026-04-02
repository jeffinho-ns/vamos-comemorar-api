function safeGetHostFromHeaderUrl(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const u = new URL(value);
    return (u.hostname || '').toLowerCase();
  } catch {
    return null;
  }
}

function buildAllowedHostsFromConfig(config) {
  const origins = config?.server?.cors?.origin;
  const list = Array.isArray(origins) ? origins : [];

  const hosts = new Set();
  for (const origin of list) {
    const h = safeGetHostFromHeaderUrl(origin);
    if (h) hosts.add(h);
  }

  // Permitir o próprio host do backend (caso algum fluxo use referer interno)
  return hosts;
}

/**
 * Proteção simples contra hotlinking:
 * - Se Referer/Origin presente: host deve estar na allowlist
 * - Se ausente: permitir (para não quebrar apps/bots legítimos), mas a rota deve estar com rate limit.
 */
function hotlinkProtection({ allowedHosts }) {
  const allowed = allowedHosts instanceof Set ? allowedHosts : new Set(allowedHosts || []);

  return (req, res, next) => {
    const referer = req.headers.referer;
    const origin = req.headers.origin;

    const host = safeGetHostFromHeaderUrl(referer) || safeGetHostFromHeaderUrl(origin);
    if (!host) return next(); // sem referer/origin: não bloquear, só rate limit

    if (allowed.has(host)) return next();

    res.status(403).json({
      error: 'Hotlink bloqueado',
      details: 'Referer/Origin não permitido para consumir imagens.',
    });
  };
}

module.exports = {
  buildAllowedHostsFromConfig,
  hotlinkProtection,
};


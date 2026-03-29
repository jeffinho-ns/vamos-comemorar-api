/**
 * Super administradores: acesso irrestrito a logs e dados (além do role admin).
 * Pode sobrescrever via env SUPER_ADMIN_EMAILS (lista separada por vírgulas).
 */
const DEFAULT_SUPER_ADMIN_EMAILS = [
  'jeffinho_ns@hotmail.com',
  'teste@teste',
];

function loadSuperAdminEmails() {
  const raw = process.env.SUPER_ADMIN_EMAILS;
  if (raw && String(raw).trim()) {
    return String(raw)
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  }
  return [...DEFAULT_SUPER_ADMIN_EMAILS];
}

const emailSet = new Set(loadSuperAdminEmails());

function isSuperAdminEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return emailSet.has(email.trim().toLowerCase());
}

function isSuperAdminUser(req) {
  const role = (req.user?.role || '').toLowerCase().trim();
  if (role === 'admin') return true;
  const email = (req.user?.email || '').trim().toLowerCase();
  return isSuperAdminEmail(email);
}

module.exports = {
  loadSuperAdminEmails,
  isSuperAdminEmail,
  isSuperAdminUser,
};

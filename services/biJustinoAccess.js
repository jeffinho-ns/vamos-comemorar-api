const crypto = require('crypto');

/** Mesma lista de app/utils/biJustinoAccess.ts no site. */
const BI_JUSTINO_EMAILS = new Set([
  'jeffinho_ns@hotmail.com',
  'luisfelipe@ideiaum.com.br',
  'coordenadora.reservas@ideiaum.com.br',
  'renatocury@ideiaum.com.br',
  'renato@seujustino.com.br',
]);

const OWNER_EMAILS = new Set([
  'jeffinho_ns@hotmail.com',
  'renatocury@ideiaum.com.br',
  'renato@seujustino.com.br',
]);

const PROOF_TTL_MS = 2 * 60 * 1000;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function canOpenBiJustino(email, isSuperAdmin) {
  if (isSuperAdmin === true) return true;
  return BI_JUSTINO_EMAILS.has(normalizeEmail(email));
}

function profileFor(email, isSuperAdmin) {
  const key = normalizeEmail(email);
  if (!canOpenBiJustino(key, isSuperAdmin)) return null;
  const owner = isSuperAdmin === true || OWNER_EMAILS.has(key);
  return { email: key, role: owner ? 'owner' : 'user', areas: 'all' };
}

function signBridgeProof(profile) {
  const secret = process.env.BI_JUSTINO_BRIDGE_SECRET;
  if (!secret || !profile) return null;
  const exp = Date.now() + PROOF_TTL_MS;
  const payload = [profile.email, profile.role, profile.areas, String(exp)].join('|');
  const body = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  return `${body}.${sig}`;
}

module.exports = {
  BI_JUSTINO_EMAILS,
  canOpenBiJustino,
  profileFor,
  signBridgeProof,
};

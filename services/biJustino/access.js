'use strict';

/**
 * Leitura do BI do Seu Justino. Não abre para a equipe inteira.
 * renato@ideiaum.com.br fica de fora: é promoter de evento, não o Renato Cury.
 */

const BI_JUSTINO_EMAILS = new Set([
  'renatocury@ideiaum.com.br',
  'renato@seujustino.com.br',
  'coordenadora.reservas@ideiaum.com.br',
  'luisfelipe@ideiaum.com.br',
  'gabrielmenda@ideiaum.com.br',
]);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isBiJustinoEmail(email) {
  return BI_JUSTINO_EMAILS.has(normalizeEmail(email));
}

async function canReadBiJustino(pool, user) {
  if (!user || !user.id) return false;
  if (user.is_super_admin === true) return true;
  if (isBiJustinoEmail(user.email)) return true;
  if (!pool) return false;
  const { rows } = await pool.query(
    `SELECT email, COALESCE(is_super_admin, FALSE) AS is_super_admin
       FROM users
      WHERE id = $1`,
    [user.id],
  );
  const row = rows[0];
  if (!row) return false;
  if (row.is_super_admin) return true;
  return isBiJustinoEmail(row.email);
}

module.exports = {
  BI_JUSTINO_EMAILS,
  isBiJustinoEmail,
  canReadBiJustino,
};

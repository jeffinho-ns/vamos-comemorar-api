'use strict';

const { canReadBiJustino } = require('../access');

/**
 * Quem pode executar, pelo robô, as ações que no painel do Renato são só da Diretoria
 * (aprovar cotação, enviar contrato, aprovar/negar item de auditoria, decidir solicitação de
 * contato, decidir freelancer, fechar mês). O robô do Apps Script é dono da planilha, então a
 * trava precisa ficar aqui.
 */
const DIRETORIA_EMAILS = new Set([
  'renatocury@ideiaum.com.br',
  'renato@seujustino.com.br',
]);

function normalizar(email) {
  return String(email || '').trim().toLowerCase();
}

async function podeAprovarBiJustino(pool, user) {
  if (!user || !user.id) return false;
  if (user.is_super_admin === true) return true;
  if (DIRETORIA_EMAILS.has(normalizar(user.email))) return true;
  if (!pool) return false;
  const leitor = await canReadBiJustino(pool, user);
  if (!leitor) return false;
  const { rows } = await pool.query(
    `SELECT email, COALESCE(is_super_admin, FALSE) AS is_super_admin FROM users WHERE id = $1`,
    [user.id],
  );
  const row = rows[0];
  if (!row) return false;
  return Boolean(row.is_super_admin) || DIRETORIA_EMAILS.has(normalizar(row.email));
}

module.exports = {
  DIRETORIA_EMAILS,
  podeAprovarBiJustino,
};

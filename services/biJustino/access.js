'use strict';

/**
 * Leitura do BI do Seu Justino. Não abre para a equipe inteira.
 * renatocury@ideiaum.com.br é o Renato Cury (dono/leitura do painel).
 * renato@ideiaum.com.br fica de fora: é promoter de evento, outra pessoa.
 * carolline.moreira@ideiaum.com.br entra só em RH, Documentos, Manual e Contatos.
 */

const BI_JUSTINO_EMAILS = new Set([
  'renatocury@ideiaum.com.br',
  'renato@seujustino.com.br',
  'coordenadora.reservas@ideiaum.com.br',
  'luisfelipe@ideiaum.com.br',
  'gabrielmenda@ideiaum.com.br',
  'carolline.moreira@ideiaum.com.br',
]);

const BI_JUSTINO_PAGINAS = [
  'master',
  'operacao',
  'marketing',
  'financeiro',
  'rh',
  'cmv',
  'eventos',
  'reservas',
  'auditoriaop',
  'auditoria',
  'documentos',
  'manual',
  'contatos',
];

const BI_JUSTINO_ESCOPOS = {
  'carolline.moreira@ideiaum.com.br': ['rh', 'documentos', 'manual', 'contatos'],
};

const AREAS_LIVRES = new Set(['duvidas', 'permissoes']);

/** Chaves do espelho que cada página precisa — inclui o apoio do RH (faturamento/pax). */
const CHAVES_POR_PAGINA = {
  rh: [
    'getEntries:rh',
    'getEntries:financeiro',
    'getEntries:marketing',
    'getEntries:operacao',
    'getEntries:cmv',
    'getRevenueOverview',
    'getZigRevenue',
    'getEmployees',
    'getSalaries',
    'getSectorBase',
    'getFreelancerRequests',
    'getMonthClosures:rh',
    'getReservations',
    'getDailyAttendance',
    'getDuvidas',
    'getEmployeesMonth:',
  ],
  documentos: ['getDocumentacoes'],
  manual: ['getManualPdfInfo', 'getManualPdf'],
  contatos: ['getContatosEmergencia', 'getContatoSolicitacoes', 'getDuvidas'],
};

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isBiJustinoEmail(email) {
  return BI_JUSTINO_EMAILS.has(normalizeEmail(email));
}

function temRecorteBiJustino(email) {
  return Object.prototype.hasOwnProperty.call(BI_JUSTINO_ESCOPOS, normalizeEmail(email));
}

function paginasBiJustino(email) {
  const recorte = BI_JUSTINO_ESCOPOS[normalizeEmail(email)];
  return recorte ? recorte.slice() : BI_JUSTINO_PAGINAS.slice();
}

function podePaginaBiJustino(email, pagina) {
  const id = String(pagina || '').trim().toLowerCase();
  if (AREAS_LIVRES.has(id)) return isBiJustinoEmail(email);
  return paginasBiJustino(email).includes(id);
}

function areaDoCaminhoBiJustino(caminho) {
  const path = String(caminho || '');
  if (path.includes('/documentos/manual')) return 'manual';
  if (path.includes('/documentos')) return 'documentos';
  if (path.includes('/contatos')) return 'contatos';
  if (path.includes('/envio/rh') || /\/rh(\/|$)/.test(path)) return 'rh';
  if (path.includes('/envio/financeiro') || path.includes('/financeiro')) return 'financeiro';
  if (path.includes('/envio/cmv') || /\/cmv(\/|$)/.test(path)) return 'cmv';
  if (path.includes('/marketing/duvidas') || path.includes('/operacao/duvidas')) return 'duvidas';
  if (path.includes('/operacao/permissoes')) return 'permissoes';
  if (path.includes('/marketing')) return 'marketing';
  if (path.includes('/diretoria') || path.includes('/ao-vivo')) return 'master';
  if (path.includes('/eventos')) return 'eventos';
  if (path.includes('/reservas')) return 'reservas';
  if (path.includes('/auditoria-op') || path.includes('/auditoriaop')) return 'auditoriaop';
  if (path.includes('/operacao')) return 'operacao';
  return null;
}

function chavePermitida(email, chave) {
  if (!temRecorteBiJustino(email)) return true;
  const pedida = String(chave || '');
  return paginasBiJustino(email).some((pagina) => {
    const prefixos = CHAVES_POR_PAGINA[pagina] || [];
    return prefixos.some((prefixo) => pedida === prefixo || pedida.startsWith(prefixo));
  });
}

function filtrarChavesBiJustino(email, chaves) {
  return (chaves || []).filter((chave) => chavePermitida(email, chave));
}

async function emailDoUsuario(pool, user) {
  if (user && user.email) return normalizeEmail(user.email);
  if (!pool || !user || !user.id) return '';
  const { rows } = await pool.query(
    'SELECT email FROM users WHERE id = $1',
    [user.id],
  );
  return normalizeEmail(rows[0] && rows[0].email);
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

async function canReadBiJustinoArea(pool, user, area) {
  if (!(await canReadBiJustino(pool, user))) return false;
  if (user && user.is_super_admin === true) return true;
  const email = await emailDoUsuario(pool, user);
  if (AREAS_LIVRES.has(area)) return true;
  if (!area) return !temRecorteBiJustino(email);
  return podePaginaBiJustino(email, area);
}

module.exports = {
  BI_JUSTINO_EMAILS,
  BI_JUSTINO_PAGINAS,
  BI_JUSTINO_ESCOPOS,
  isBiJustinoEmail,
  paginasBiJustino,
  podePaginaBiJustino,
  areaDoCaminhoBiJustino,
  filtrarChavesBiJustino,
  emailDoUsuario,
  canReadBiJustino,
  canReadBiJustinoArea,
};

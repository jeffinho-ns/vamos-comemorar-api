'use strict';

/**
 * Leitura do BI do Seu Justino. Não abre para a equipe inteira.
 * renatocury@ideiaum.com.br é o Renato Cury (dono/leitura do painel).
 * renato@ideiaum.com.br fica de fora: é promoter de evento, outra pessoa.
 * carolline.moreira@ideiaum.com.br entra em tudo, menos na Diretoria.
 * gabrielmenda@ideiaum.com.br entra só em Marketing, Eventos, Reservas, Documentos, Manual e Contatos.
 * gerente.sjm@seujustino.com.br entra só em Gerente Operador, Documentos, Manual e Contatos.
 */

const { canAccessBiJustinoFromUep, sanitizeMenuAccess } = require('../../tenancy/menuAccess');
const {
  BI_PAGE_KEYS,
  sanitizeBiMenuAccess,
  hasBiJustinoAccess,
  unionBiMenuAccess,
} = require('../../tenancy/biMenuAccess');

const SEU_JUSTINO_ESTABLISHMENT_ID = 1;

const BI_JUSTINO_EMAILS = new Set([
  'renatocury@ideiaum.com.br',
  'renato@seujustino.com.br',
  'coordenadora.reservas@ideiaum.com.br',
  'luisfelipe@ideiaum.com.br',
  'gabrielmenda@ideiaum.com.br',
  'carolline.moreira@ideiaum.com.br',
  'gerente.sjm@seujustino.com.br',
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
  'carolline.moreira@ideiaum.com.br': BI_JUSTINO_PAGINAS.filter((id) => id !== 'master'),
  'gabrielmenda@ideiaum.com.br': ['marketing', 'eventos', 'reservas', 'documentos', 'manual', 'contatos'],
  'gerente.sjm@seujustino.com.br': ['operacao', 'documentos', 'manual', 'contatos'],
};

const AREAS_LIVRES = new Set(['duvidas', 'permissoes']);

/** Chaves do espelho que cada página precisa — inclui o apoio do RH, do Marketing e da Operação. */
const CHAVES_POR_PAGINA = {
  operacao: [
    'getEntries:operacao',
    'getFreelancerRequests',
    'getEmployees',
    'getSectorBase',
    'getDailyAttendance',
    'getMonthClosures:operacao',
    'getZigHourly',
    'getZigHourlyDetail',
    'getReservations',
    'getEventos',
    'getMeterReadings',
    'getDuvidas',
  ],
  marketing: [
    'getEntries:marketing',
    'getEntries:financeiro',
    'getEntries:rh',
    'getEntries:operacao',
    'getEntries:cmv',
    'getMkPlans',
    'getMkReunioes',
    'getIgAtivacoes',
    'getIgRetorno',
    'getInstagram',
    'getGoogleAvaliacoes',
    'getBandRanking',
    'getBudgetAtracoesBase',
    'getZigDelivery',
    'get99Food',
    'getDreFaturamentoHistorico',
    'getZigRevenue',
    'getRevenueOverview',
    'getFaturamentoSemanas',
    'getZigHourly',
    'getZigHourlyDetail',
    'getZigBilheteria',
    'getFreelancerRequests',
    'getMonthClosures:marketing',
    'getReservations',
    'getReservationEntries',
    'getDuvidas',
  ],
  eventos: [
    'getEventos',
    'getEventoTarefas',
    'getEventoCotacoes',
    'getEventoPacotesPdfInfo',
    'getMonthClosures:eventos',
  ],
  reservas: [
    'getReservations',
    'getReservationEntries',
    'getCrmReservas',
    'getCrmFunil',
    'getCrmConfig',
    'getEventos',
    'getIgAtivacoes',
    'getMonthClosures:reservas',
  ],
  financeiro: [
    'getEntries:financeiro',
    'getEntries:marketing',
    'getEntries:rh',
    'getEntries:operacao',
    'getEntries:cmv',
    'getRevenueOverview',
    'getZigRevenue',
    'getDreBase',
    'getDreFaturamentoHistorico',
    'getMonthClosures:financeiro',
    'getFreelancerRequests',
    'getSalaries',
    'getDuvidas',
    'getDreParaMes:',
  ],
  cmv: [
    'getCmvTeoricoParcial',
    'getZigItemSalesRanking',
    'getZigRevenue',
    'getEntries:cmv',
    'getMonthClosures:cmv',
    'getDuvidas',
  ],
  auditoriaop: [
    'getAuditoriaOpItens',
    'getMonthClosures:auditoriaop',
  ],
  auditoria: [
    'getAuditLog',
    'getDeletionsLog',
    'getUsersList',
  ],
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

function paginasBiJustino(email, biMenuAccess) {
  const fromUep = sanitizeBiMenuAccess(biMenuAccess);
  if (fromUep.length > 0) return fromUep;
  const recorte = BI_JUSTINO_ESCOPOS[normalizeEmail(email)];
  return recorte ? recorte.slice() : BI_JUSTINO_PAGINAS.slice();
}

function listaCompletaBi(paginas) {
  return BI_JUSTINO_PAGINAS.every((id) => (paginas || []).includes(id));
}

function temRecorteBiJustinoEfetivo(email, biMenuAccess) {
  const fromUep = sanitizeBiMenuAccess(biMenuAccess);
  if (fromUep.length > 0) return !listaCompletaBi(fromUep);
  return temRecorteBiJustino(email);
}

function podePaginaBiJustino(email, pagina, biMenuAccess) {
  const id = String(pagina || '').trim().toLowerCase();
  if (AREAS_LIVRES.has(id)) {
    return isBiJustinoEmail(email) || sanitizeBiMenuAccess(biMenuAccess).length > 0;
  }
  return paginasBiJustino(email, biMenuAccess).includes(id);
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

function chavePermitida(email, chave, biMenuAccess) {
  if (!temRecorteBiJustinoEfetivo(email, biMenuAccess)) return true;
  const pedida = String(chave || '');
  return paginasBiJustino(email, biMenuAccess).some((pagina) => {
    const prefixos = CHAVES_POR_PAGINA[pagina] || [];
    return prefixos.some((prefixo) => pedida === prefixo || pedida.startsWith(prefixo));
  });
}

function filtrarChavesBiJustino(email, chaves, biMenuAccess) {
  return (chaves || []).filter((chave) => chavePermitida(email, chave, biMenuAccess));
}

function escopoBiDoObjeto(user) {
  if (!user) return null;
  const hasMenu = user.menuAccess != null || user.menu_access != null;
  const hasBi = user.biMenuAccess != null || user.bi_menu_access != null;
  if (!hasMenu && !hasBi) return null;
  return {
    menuAccess: sanitizeMenuAccess(user.menuAccess || user.menu_access),
    biMenuAccess: sanitizeBiMenuAccess(user.biMenuAccess || user.bi_menu_access),
  };
}

async function loadUepBiScope(pool, user) {
  const fromUser = escopoBiDoObjeto(user);
  if (fromUser) return fromUser;
  if (!pool || !user || !user.id) return { menuAccess: [], biMenuAccess: [] };
  try {
    const { rows } = await pool.query(
      `SELECT menu_access, bi_menu_access
         FROM user_establishment_permissions
        WHERE user_id = $1 AND is_active = TRUE AND establishment_id = $2`,
      [user.id, SEU_JUSTINO_ESTABLISHMENT_ID],
    );
    return {
      menuAccess: sanitizeMenuAccess(rows[0] && rows[0].menu_access),
      biMenuAccess: unionBiMenuAccess(rows),
    };
  } catch (err) {
    const msg = String(err && err.message ? err.message : err || '');
    if (/column ["']?bi_menu_access["']? does not exist/i.test(msg)) {
      try {
        const { rows } = await pool.query(
          `SELECT menu_access
             FROM user_establishment_permissions
            WHERE user_id = $1 AND is_active = TRUE AND establishment_id = $2`,
          [user.id, SEU_JUSTINO_ESTABLISHMENT_ID],
        );
        return {
          menuAccess: sanitizeMenuAccess(rows[0] && rows[0].menu_access),
          biMenuAccess: [],
        };
      } catch (_) {
        return { menuAccess: [], biMenuAccess: [] };
      }
    }
    return { menuAccess: [], biMenuAccess: [] };
  }
}

async function escopoBiDoUsuario(pool, user) {
  const email = await emailDoUsuario(pool, user);
  const uep = await loadUepBiScope(pool, user);
  return { email, ...uep };
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

  const scope = await loadUepBiScope(pool, user);
  if (hasBiJustinoAccess(scope.menuAccess, scope.biMenuAccess)) return true;

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
  const { email, biMenuAccess } = await escopoBiDoUsuario(pool, user);
  if (AREAS_LIVRES.has(area)) return true;
  if (!area) return !temRecorteBiJustinoEfetivo(email, biMenuAccess);
  return podePaginaBiJustino(email, area, biMenuAccess);
}

module.exports = {
  BI_JUSTINO_EMAILS,
  BI_JUSTINO_PAGINAS,
  BI_JUSTINO_ESCOPOS,
  BI_PAGE_KEYS,
  isBiJustinoEmail,
  paginasBiJustino,
  podePaginaBiJustino,
  areaDoCaminhoBiJustino,
  filtrarChavesBiJustino,
  emailDoUsuario,
  escopoBiDoUsuario,
  loadUepBiScope,
  canReadBiJustino,
  canReadBiJustinoArea,
  canAccessBiJustinoFromUep,
  hasBiJustinoAccess,
};

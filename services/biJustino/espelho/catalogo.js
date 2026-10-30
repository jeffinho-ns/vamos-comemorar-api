'use strict';

/**
 * Catálogo do espelho da planilha do Seu Justino.
 *
 * Cada leitura `get*` do Apps Script vira uma chave no banco (`bi_source_snapshots.source = 'planilha:<chave>'`).
 * O painel do Renato (BI_Gerencial_Seu_Justino_v2.html) chama essas ações ao vivo; aqui elas são baixadas
 * para o Postgres e o front lê do banco.
 *
 * ritmo:
 *  - 'rapido'  → dados que mudam ao longo do dia; recoletados em todo ciclo do coletor (5 min).
 *  - 'lento'   → históricos pesados ou que mudam pouco; recoletados a cada hora e na coleta completa.
 */

function mesAtual() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' })
    .format(new Date());
}

function hojeIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
}

function mesesAnteriores(qtd) {
  const [ano, mes] = mesAtual().split('-').map(Number);
  const saida = [];
  for (let i = 0; i < qtd; i += 1) {
    const d = new Date(Date.UTC(ano, mes - 1 - i, 1));
    saida.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return saida;
}

const AREAS_ENTRIES = ['financeiro', 'cmv', 'marketing', 'rh', 'operacao'];
const AREAS_FECHAMENTO = ['financeiro', 'marketing', 'rh', 'operacao', 'cmv'];

function fixas() {
  return [
    // Marketing / Instagram / Google / Delivery
    { chave: 'getMkPlans', action: 'getMkPlans', ritmo: 'rapido' },
    { chave: 'getMkReunioes', action: 'getMkReunioes', ritmo: 'rapido' },
    { chave: 'getIgAtivacoes', action: 'getIgAtivacoes', ritmo: 'rapido' },
    { chave: 'getIgRetorno', action: 'getIgRetorno', ritmo: 'lento' },
    { chave: 'getInstagram', action: 'getInstagram', ritmo: 'lento' },
    { chave: 'getGoogleAvaliacoes', action: 'getGoogleAvaliacoes', ritmo: 'rapido' },
    { chave: 'getBandRanking', action: 'getBandRanking', ritmo: 'lento' },
    { chave: 'getBudgetAtracoesBase', action: 'getBudgetAtracoesBase', ritmo: 'lento' },
    { chave: 'get99Food', action: 'get99Food', ritmo: 'lento' },
    { chave: 'getZigDelivery', action: 'getZigDelivery', payload: { days: 90 }, ritmo: 'lento' },
    // Faturamento / Zig / DRE
    { chave: 'getDreBase', action: 'getDreBase', ritmo: 'lento' },
    { chave: 'getDreFaturamentoHistorico', action: 'getDreFaturamentoHistorico', ritmo: 'lento' },
    { chave: 'getFaturamentoSemanas', action: 'getFaturamentoSemanas', ritmo: 'lento' },
    { chave: 'getRevenueOverview', action: 'getRevenueOverview', ritmo: 'rapido' },
    { chave: 'getZigRevenue', action: 'getZigRevenue', payload: { limit: 2000 }, ritmo: 'rapido' },
    { chave: 'getZigBilheteria', action: 'getZigBilheteria', payload: { limit: 60 }, ritmo: 'lento' },
    { chave: 'getZigHourly', action: 'getZigHourly', payload: { days: 400 }, ritmo: 'lento' },
    { chave: 'getZigHourlyDetail', action: 'getZigHourlyDetail', payload: { days: 120 }, ritmo: 'lento' },
    { chave: 'getZigItemSalesRanking', action: 'getZigItemSalesRanking', payload: { days: 30 }, ritmo: 'lento' },
    { chave: 'getCmvTeoricoParcial', action: 'getCmvTeoricoParcial', payload: { limit: 24 }, ritmo: 'lento' },
    { chave: 'getMeterReadings', action: 'getMeterReadings', ritmo: 'rapido' },
    // RH
    { chave: 'getEmployees', action: 'getEmployees', ritmo: 'lento' },
    { chave: 'getSalaries', action: 'getSalaries', ritmo: 'lento' },
    { chave: 'getSectorBase', action: 'getSectorBase', ritmo: 'lento' },
    { chave: 'getFreelancerRequests', action: 'getFreelancerRequests', ritmo: 'rapido' },
    // Eventos / Reservas / CRM
    { chave: 'getEventos', action: 'getEventos', ritmo: 'rapido' },
    { chave: 'getEventoTarefas', action: 'getEventoTarefas', ritmo: 'rapido' },
    { chave: 'getEventoCotacoes', action: 'getEventoCotacoes', ritmo: 'rapido' },
    { chave: 'getReservations', action: 'getReservations', payload: { limit: 400 }, ritmo: 'rapido' },
    { chave: 'getCrmReservas', action: 'getCrmReservas', ritmo: 'lento' },
    { chave: 'getCrmFunil', action: 'getCrmFunil', ritmo: 'lento' },
    { chave: 'getCrmConfig', action: 'getCrmConfig', ritmo: 'lento' },
    // Auditoria / Sistema / Documentos / Contatos
    { chave: 'getAuditoriaOpItens', action: 'getAuditoriaOpItens', ritmo: 'rapido' },
    { chave: 'getAuditLog', action: 'getAuditLog', payload: { limit: 500 }, ritmo: 'lento' },
    { chave: 'getDeletionsLog', action: 'getDeletionsLog', ritmo: 'lento' },
    { chave: 'getUsersList', action: 'getUsersList', ritmo: 'lento' },
    { chave: 'getDocumentacoes', action: 'getDocumentacoes', ritmo: 'lento' },
    { chave: 'getContatosEmergencia', action: 'getContatosEmergencia', ritmo: 'lento' },
    { chave: 'getContatoSolicitacoes', action: 'getContatoSolicitacoes', ritmo: 'rapido' },
    { chave: 'getDuvidas', action: 'getDuvidas', ritmo: 'rapido' },
    { chave: 'getManualPdfInfo', action: 'getManualPdfInfo', ritmo: 'lento' },
    { chave: 'getEventoPacotesPdfInfo', action: 'getEventoPacotesPdfInfo', ritmo: 'lento' },
  ];
}

function parametrizadas() {
  const hoje = hojeIso();
  return [
    ...AREAS_ENTRIES.map((area) => ({
      chave: `getEntries:${area}`, action: 'getEntries', payload: { area, limit: 400 }, ritmo: 'rapido',
    })),
    ...AREAS_FECHAMENTO.map((area) => ({
      chave: `getMonthClosures:${area}`, action: 'getMonthClosures', payload: { area }, ritmo: 'lento',
    })),
    ...mesesAnteriores(3).map((mesKey) => ({
      chave: `getDreParaMes:${mesKey}`, action: 'getDreParaMes', payload: { mesKey }, ritmo: 'lento',
    })),
    ...mesesAnteriores(2).map((mesKey) => ({
      chave: `getEmployeesMonth:${mesKey}`, action: 'getEmployeesMonth', payload: { mes: mesKey }, ritmo: 'lento',
    })),
    { chave: 'getDailyAttendance', action: 'getDailyAttendance', ritmo: 'rapido' },
    { chave: 'getReservationEntries', action: 'getReservationEntries', payload: { limit: 400 }, ritmo: 'rapido' },
    { chave: 'getDailyAttendance:hoje', action: 'getDailyAttendance', payload: { date: hoje }, ritmo: 'rapido' },
  ];
}

/** Todas as leituras do espelho, já com a chave final. */
function listarLeituras() {
  return [...fixas(), ...parametrizadas()];
}

function leiturasPorRitmo(ritmo) {
  return listarLeituras().filter((item) => item.ritmo === ritmo);
}

function encontrarLeitura(chave) {
  return listarLeituras().find((item) => item.chave === chave) || null;
}

function fonteDaChave(chave) {
  return `planilha:${chave}`;
}

module.exports = {
  AREAS_ENTRIES,
  AREAS_FECHAMENTO,
  listarLeituras,
  leiturasPorRitmo,
  encontrarLeitura,
  fonteDaChave,
  mesAtual,
  hojeIso,
  mesesAnteriores,
};

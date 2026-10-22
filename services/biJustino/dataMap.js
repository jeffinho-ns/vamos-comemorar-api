'use strict';

/**
 * O que o painel do Seu Justino pede (ações get* do HTML) e de onde sai hoje.
 * nosso_banco: já gravado pelo Agilizai.
 * aguarda_variaveis: planilha, Zig, SharePoint ou Instagram — só entra quando as variáveis chegarem.
 */

const DATA_MAP = [
  { action: 'getReservations', area: 'Operação', label: 'Reservas', origem: 'nosso_banco', tabela: 'restaurant_reservations' },
  { action: 'getDailyAttendance', area: 'Operação', label: 'Presença e check-in do dia', origem: 'nosso_banco', tabela: 'restaurant_reservations.checked_in, guests.checked_in' },

  { action: 'getReservationEntries', area: 'Operação', label: 'Lançamentos manuais de reserva', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getEntries', area: 'Áreas', label: 'Lançamentos por área (master, marketing, financeiro, RH, operação, CMV)', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getMonthClosures', area: 'Financeiro', label: 'Fechamentos do mês', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getZigRevenue', area: 'Financeiro', label: 'Faturamento Zig dia a dia', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getRevenueOverview', area: 'Financeiro', label: 'Visão geral de faturamento', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getZigHourly', area: 'Financeiro', label: 'Faturamento por hora', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getZigHourlyDetail', area: 'Financeiro', label: 'Detalhe do faturamento por hora', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getZigBilheteria', area: 'Financeiro', label: 'Bilheteria Zig', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getZigItemSalesRanking', area: 'Financeiro', label: 'Ranking de itens vendidos', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getCmvTeoricoParcial', area: 'CMV', label: 'CMV teórico parcial', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getDreBase', area: 'DRE', label: 'Base da DRE', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getDreParaMes', area: 'DRE', label: 'DRE do mês', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getDreFaturamentoHistorico', area: 'DRE', label: 'Histórico de faturamento da DRE', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getMeterReadings', area: 'Operação', label: 'Leituras de medidores', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getBandRanking', area: 'Marketing', label: 'Ranking de bandas', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getBudgetAtracoesBase', area: 'Marketing', label: 'Orçamento de atrações', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getMkPlans', area: 'Marketing', label: 'Planos de marketing', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getMkReunioes', area: 'Marketing', label: 'Reuniões de marketing', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getInstagram', area: 'Marketing', label: 'Instagram', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getIgRetorno', area: 'Marketing', label: 'Retorno do Instagram', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getIgAtivacoes', area: 'Marketing', label: 'Ativações do Instagram', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getEmployees', area: 'RH', label: 'Colaboradores', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getEmployeeMonth', area: 'RH', label: 'Folha do colaborador no mês', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getEmployeesMonth', area: 'RH', label: 'Folha do mês', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getEmployeeDocs', area: 'RH', label: 'Documentos do colaborador', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getSalaries', area: 'RH', label: 'Salários', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getSectorBase', area: 'RH', label: 'Quadro mínimo por setor', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getFreelancerRequests', area: 'RH', label: 'Pedidos de freelancer', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getEventos', area: 'Eventos', label: 'Eventos comerciais da planilha', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getEventoTarefas', area: 'Eventos', label: 'Tarefas do evento', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getEventoInteracoes', area: 'Eventos', label: 'Interações do evento', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getEventoCotacoes', area: 'Eventos', label: 'Cotações do evento', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getDuvidas', area: 'Operação', label: 'Dúvidas', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getContatosEmergencia', area: 'Operação', label: 'Contatos de emergência', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getDocumentacoes', area: 'Operação', label: 'Documentações', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getAuditLog', area: 'Auditoria', label: 'Log de auditoria', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getAuditoriaOpItens', area: 'Auditoria', label: 'Itens da auditoria operacional', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getAuditoriaOpEvidencias', area: 'Auditoria', label: 'Evidências da auditoria', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getUsersList', area: 'Acesso', label: 'Usuários do painel', origem: 'aguarda_variaveis', tabela: null },
  { action: 'getDeletionsLog', area: 'Acesso', label: 'Log de exclusões', origem: 'aguarda_variaveis', tabela: null },
];

function listDataMap() {
  return DATA_MAP.map((item) => ({ ...item }));
}

module.exports = { listDataMap };

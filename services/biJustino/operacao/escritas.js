'use strict';

const freelancers = require('./freelancers');
const registro = require('./registroDia');
const reservas = require('./reservas');
const auditoriaOp = require('./auditoriaOp');
const eventos = require('../eventos/validacao');
const sistema = require('../sistema/validacao');

/**
 * Tabela dos proxies de escrita da área Gerente Operador / Eventos / Reservas / Auditoria / Sistema.
 * Cada entrada vira `POST /api/bi<caminho>`: valida o corpo, grava na planilha via `gravarNaPlanilha`
 * e recoleta as chaves do espelho que a escrita afeta.
 *
 * `aprovacao: true` → além de ler o BI, o usuário precisa ser Diretoria (sistema/aprovacao.js),
 * porque no painel do Renato essas ações são só do dono/'master'.
 */
const FREELANCER_CHAVES = ['getFreelancerRequests'];
const EVENTOS_CHAVES = ['getEventos'];
const COTACOES_CHAVES = ['getEventoCotacoes', 'getEventos'];
const RESERVAS_CHAVES = ['getReservationEntries', 'getReservations'];
const AUDITORIA_CHAVES = ['getAuditoriaOpItens'];
const CONTATOS_CHAVES = ['getContatosEmergencia', 'getContatoSolicitacoes'];

function fechamentoChaves(payload) {
  return [`getMonthClosures:${payload.area}`];
}

const ESCRITAS = [
  // Gerente Operador — freelancers
  { caminho: '/justino/operacao/freelancers/solicitar', action: 'submitFreelancerRequest', validar: freelancers.validarSolicitacao, recoletar: FREELANCER_CHAVES },
  { caminho: '/justino/operacao/freelancers/solicitar-lote', action: 'submitFreelancerRequestsBatch', validar: freelancers.validarLote, recoletar: FREELANCER_CHAVES },
  { caminho: '/justino/operacao/freelancers/decidir', action: 'decideFreelancerRequest', validar: freelancers.validarDecisao, recoletar: FREELANCER_CHAVES, aprovacao: true },
  { caminho: '/justino/operacao/freelancers/decidir-lote', action: 'decideFreelancerRequestsBatch', validar: freelancers.validarDecisaoLote, recoletar: FREELANCER_CHAVES, aprovacao: true },
  { caminho: '/justino/operacao/freelancers/separar', action: 'splitFreelancerRequest', validar: freelancers.validarId, recoletar: FREELANCER_CHAVES },
  { caminho: '/justino/operacao/freelancers/presenca', action: 'markFreelancerAttendance', validar: freelancers.validarPresenca, recoletar: FREELANCER_CHAVES },
  { caminho: '/justino/operacao/freelancers/nomes', action: 'setFreelancerNames', validar: freelancers.validarNomes, recoletar: FREELANCER_CHAVES },
  { caminho: '/justino/operacao/freelancers/apagar', action: 'deleteFreelancerRequest', validar: freelancers.validarId, recoletar: FREELANCER_CHAVES },
  // Gerente Operador — público ZigPay, dúvidas e fechamento
  { caminho: '/justino/operacao/zig-publico', action: 'submitZigPublico', validar: registro.validarZigPublico, recoletar: ['getZigRevenue', 'getRevenueOverview'] },
  { caminho: '/justino/operacao/duvidas/enviar', action: 'submitDuvida', validar: registro.validarDuvida, recoletar: ['getDuvidas'] },
  { caminho: '/justino/operacao/duvidas/responder', action: 'responderDuvida', validar: registro.validarResposta, recoletar: ['getDuvidas'] },
  { caminho: '/justino/operacao/fechar-mes', action: 'closeMonth', validar: registro.validarFecharMes, recoletar: fechamentoChaves, aprovacao: true },
  { caminho: '/justino/operacao/reabrir-mes', action: 'reopenMonth', validar: registro.validarFecharMes, recoletar: fechamentoChaves, aprovacao: true },
  { caminho: '/justino/operacao/presenca-diaria', action: 'setDailyAttendance', validar: registro.validarPresencaDiaria, recoletar: ['getDailyAttendance', 'getDailyAttendance:hoje'] },
  // Eventos
  { caminho: '/justino/eventos/salvar', action: 'saveEvento', validar: eventos.validarEvento, recoletar: EVENTOS_CHAVES },
  { caminho: '/justino/eventos/apagar', action: 'deleteEvento', validar: eventos.validarId, recoletar: EVENTOS_CHAVES },
  { caminho: '/justino/eventos/tarefas/salvar', action: 'saveEventoTarefa', validar: eventos.validarTarefa, recoletar: ['getEventoTarefas'] },
  { caminho: '/justino/eventos/tarefas/concluir', action: 'concluirEventoTarefa', validar: eventos.validarConcluirTarefa, recoletar: ['getEventoTarefas'] },
  { caminho: '/justino/eventos/tarefas/apagar', action: 'deleteEventoTarefa', validar: eventos.validarId, recoletar: ['getEventoTarefas'] },
  { caminho: '/justino/eventos/cotacoes/salvar', action: 'saveEventoCotacao', validar: eventos.validarCotacao, recoletar: COTACOES_CHAVES },
  { caminho: '/justino/eventos/cotacoes/submeter', action: 'submitEventoCotacaoForApproval', validar: eventos.validarId, recoletar: COTACOES_CHAVES },
  { caminho: '/justino/eventos/cotacoes/decidir', action: 'decideEventoCotacao', validar: eventos.validarDecisaoCotacao, recoletar: COTACOES_CHAVES, aprovacao: true },
  { caminho: '/justino/eventos/cotacoes/enviar-contrato', action: 'enviarContratoEventoCotacao', validar: eventos.validarEnvioContrato, recoletar: COTACOES_CHAVES, aprovacao: true },
  { caminho: '/justino/eventos/interacoes/salvar', action: 'saveEventoInteracao', validar: eventos.validarInteracao, recoletar: [], sobDemanda: { action: 'getEventoInteracoes', campoId: 'eventoId' } },
  { caminho: '/justino/eventos/interacoes/apagar', action: 'deleteEventoInteracao', validar: eventos.validarId, recoletar: [] },
  // Reservas
  { caminho: '/justino/reservas/enviar', action: 'submitReservationEntry', validar: reservas.validarNova, recoletar: RESERVAS_CHAVES },
  { caminho: '/justino/reservas/enviar-lote', action: 'submitReservationEntriesBatch', validar: reservas.validarLote, recoletar: RESERVAS_CHAVES },
  { caminho: '/justino/reservas/editar', action: 'updateReservationEntry', validar: reservas.validarEdicao, recoletar: RESERVAS_CHAVES },
  { caminho: '/justino/reservas/apagar', action: 'deleteReservationEntry', validar: reservas.validarId, recoletar: RESERVAS_CHAVES },
  { caminho: '/justino/reservas/crm/reservas', action: 'submitCrmReservas', validar: reservas.validarCrmReservas, recoletar: ['getCrmReservas'], aprovacao: true },
  { caminho: '/justino/reservas/crm/funil', action: 'submitCrmFunil', validar: reservas.validarCrmFunil, recoletar: ['getCrmFunil'], aprovacao: true },
  { caminho: '/justino/reservas/crm/config', action: 'submitCrmConfig', validar: reservas.validarCrmConfig, recoletar: ['getCrmConfig'], aprovacao: true },
  // Auditoria Operacional
  { caminho: '/justino/auditoria-op/salvar', action: 'saveAuditoriaOpItem', validar: auditoriaOp.validarItem, recoletar: AUDITORIA_CHAVES },
  { caminho: '/justino/auditoria-op/apagar', action: 'deleteAuditoriaOpItem', validar: auditoriaOp.validarId, recoletar: AUDITORIA_CHAVES },
  { caminho: '/justino/auditoria-op/aprovar', action: 'aprovarAuditoriaOpItem', validar: auditoriaOp.validarDecisao, recoletar: AUDITORIA_CHAVES, aprovacao: true },
  { caminho: '/justino/auditoria-op/negar', action: 'negarAuditoriaOpItem', validar: auditoriaOp.validarDecisao, recoletar: AUDITORIA_CHAVES, aprovacao: true },
  { caminho: '/justino/auditoria-op/evidencias/apagar', action: 'deleteAuditoriaOpEvidencia', validar: auditoriaOp.validarId, recoletar: [] },
  { caminho: '/justino/auditoria-op/evidencias/enviar', action: 'uploadAuditoriaOpEvidencia', validar: auditoriaOp.validarUpload, recoletar: [], sobDemanda: { action: 'getAuditoriaOpEvidencias', campoId: 'itemId' }, multipart: true },
  // Documentações
  { caminho: '/justino/documentos/salvar', action: 'saveDocumentacao', validar: sistema.validarDocumentacao, recoletar: ['getDocumentacoes'] },
  { caminho: '/justino/documentos/apagar', action: 'deleteDocumentacao', validar: sistema.validarId, recoletar: ['getDocumentacoes'] },
  { caminho: '/justino/documentos/arquivo', action: 'uploadDocumentacaoFile', validar: sistema.validarUploadArquivo, recoletar: ['getDocumentacoes'], multipart: true },
  // Contatos de emergência
  { caminho: '/justino/contatos/salvar', action: 'saveContatoEmergencia', validar: sistema.validarContato, recoletar: CONTATOS_CHAVES },
  { caminho: '/justino/contatos/apagar', action: 'deleteContatoEmergencia', validar: sistema.validarId, recoletar: CONTATOS_CHAVES },
  { caminho: '/justino/contatos/decidir', action: 'decideContatoSolicitacao', validar: sistema.validarDecisaoContato, recoletar: CONTATOS_CHAVES, aprovacao: true },
];

function chavesDe(entrada, payload) {
  return typeof entrada.recoletar === 'function' ? entrada.recoletar(payload) : entrada.recoletar;
}

module.exports = {
  ESCRITAS,
  chavesDe,
};

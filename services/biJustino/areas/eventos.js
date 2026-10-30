'use strict';

const ev = require('../eventos/validacao');

const EVENTOS = ['getEventos'];
const TAREFAS = ['getEventoTarefas'];
const COTACOES = ['getEventoCotacoes', 'getEventos'];

/** Devolve o restante da resposta da planilha (id, eventoId, contratoDocUrl…). */
function resto(resposta) {
  const { ok, ...extra } = resposta || {};
  void ok;
  return extra;
}

/**
 * Escritas da aba Eventos (painel do Renato). Cada entrada vira POST /api/bi<caminho>
 * via criarProxy: valida, grava na planilha e recoleta as chaves do espelho.
 */
const ROTAS = [
  { caminho: '/justino/eventos/salvar', action: 'saveEvento', validar: ev.validarEvento, recoletar: EVENTOS, extrair: resto },
  { caminho: '/justino/eventos/apagar', action: 'deleteEvento', validar: ev.validarId, recoletar: [...EVENTOS, ...TAREFAS, ...COTACOES, 'getDeletionsLog'] },
  { caminho: '/justino/eventos/tarefas/salvar', action: 'saveEventoTarefa', validar: ev.validarTarefa, recoletar: TAREFAS, extrair: resto },
  { caminho: '/justino/eventos/tarefas/concluir', action: 'concluirEventoTarefa', validar: ev.validarConcluirTarefa, recoletar: TAREFAS },
  { caminho: '/justino/eventos/tarefas/apagar', action: 'deleteEventoTarefa', validar: ev.validarId, recoletar: [...TAREFAS, 'getDeletionsLog'] },
  { caminho: '/justino/eventos/cotacoes/salvar', action: 'saveEventoCotacao', validar: ev.validarCotacao, recoletar: COTACOES, extrair: resto },
  { caminho: '/justino/eventos/cotacoes/submeter', action: 'submitEventoCotacaoForApproval', validar: ev.validarId, recoletar: COTACOES, extrair: resto },
  { caminho: '/justino/eventos/cotacoes/decidir', action: 'decideEventoCotacao', validar: ev.validarDecisaoCotacao, recoletar: COTACOES, extrair: resto, aprovacao: true },
  { caminho: '/justino/eventos/cotacoes/enviar-contrato', action: 'enviarContratoEventoCotacao', validar: ev.validarEnvioContrato, recoletar: COTACOES, extrair: resto, aprovacao: true },
  { caminho: '/justino/eventos/interacoes/salvar', action: 'saveEventoInteracao', validar: ev.validarInteracao, recoletar: [], extrair: resto },
  { caminho: '/justino/eventos/interacoes/apagar', action: 'deleteEventoInteracao', validar: ev.validarId, recoletar: [] },
];

module.exports = { ROTAS, resto };

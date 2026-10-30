'use strict';

const reservas = require('../operacao/reservas');

const CHAVES = ['getReservationEntries', 'getReservations'];

/** Devolve o restante da resposta da planilha (id, count…). */
function resto(resposta) {
  const { ok, ...extra } = resposta || {};
  void ok;
  return extra;
}

/**
 * Escritas da aba Reservas (painel do Renato). CRM é preenchido pelo robô Dionísio;
 * a tela só lê — as rotas existem para o robô gravar com o mesmo proxy.
 */
const ROTAS = [
  { caminho: '/justino/reservas/enviar', action: 'submitReservationEntry', validar: reservas.validarNova, recoletar: CHAVES, extrair: resto },
  { caminho: '/justino/reservas/enviar-lote', action: 'submitReservationEntriesBatch', validar: reservas.validarLote, recoletar: CHAVES, extrair: resto },
  { caminho: '/justino/reservas/editar', action: 'updateReservationEntry', validar: reservas.validarEdicao, recoletar: CHAVES, extrair: resto },
  { caminho: '/justino/reservas/apagar', action: 'deleteReservationEntry', validar: reservas.validarId, recoletar: [...CHAVES, 'getDeletionsLog'] },
  { caminho: '/justino/reservas/crm/reservas', action: 'submitCrmReservas', validar: reservas.validarCrmReservas, recoletar: ['getCrmReservas'], aprovacao: true },
  { caminho: '/justino/reservas/crm/funil', action: 'submitCrmFunil', validar: reservas.validarCrmFunil, recoletar: ['getCrmFunil'], aprovacao: true },
  { caminho: '/justino/reservas/crm/config', action: 'submitCrmConfig', validar: reservas.validarCrmConfig, recoletar: ['getCrmConfig'], aprovacao: true },
];

module.exports = { ROTAS, resto };

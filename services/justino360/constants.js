'use strict';

/** Seu Justino — places.id operacional */
const SEU_JUSTINO_ESTABLISHMENT_ID = 1;

const INCIDENT_STATUSES = ['aberta', 'em_andamento', 'aguardando', 'solucionada', 'cancelada'];
const TASK_STATUSES = ['aberta', 'em_andamento', 'aguardando', 'concluida', 'validada'];
const RUN_ITEM_STATUSES = ['pendente', 'ok', 'nao_ok', 'na'];
const PRIORITIES = ['baixa', 'media', 'alta', 'critica'];

/** Manutenção de ativos (freezer, chopeira, câmara fria…). */
const MAINTENANCE_KINDS = ['corretiva', 'preventiva', 'inspecao'];
const MAINTENANCE_STATUSES = [
  'aberta',
  'em_andamento',
  'aguardando_peca',
  'concluida',
  'cancelada',
];
const MAINTENANCE_OPEN_STATUSES = ['aberta', 'em_andamento', 'aguardando_peca'];
/**
 * Leitura aceita 'concluido' porque o MVP gravou chamados no masculino;
 * escrita nova sempre usa 'concluida'.
 */
const MAINTENANCE_DONE_STATUSES = ['concluida', 'concluido'];

module.exports = {
  SEU_JUSTINO_ESTABLISHMENT_ID,
  INCIDENT_STATUSES,
  TASK_STATUSES,
  RUN_ITEM_STATUSES,
  PRIORITIES,
  MAINTENANCE_KINDS,
  MAINTENANCE_STATUSES,
  MAINTENANCE_OPEN_STATUSES,
  MAINTENANCE_DONE_STATUSES,
};

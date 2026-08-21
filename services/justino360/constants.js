'use strict';

/** Seu Justino — places.id operacional */
const SEU_JUSTINO_ESTABLISHMENT_ID = 1;

const INCIDENT_STATUSES = ['aberta', 'em_andamento', 'aguardando', 'solucionada', 'cancelada'];
const TASK_STATUSES = ['aberta', 'em_andamento', 'aguardando', 'concluida', 'validada'];
const RUN_ITEM_STATUSES = ['pendente', 'ok', 'nao_ok', 'na'];
const PRIORITIES = ['baixa', 'media', 'alta', 'critica'];

module.exports = {
  SEU_JUSTINO_ESTABLISHMENT_ID,
  INCIDENT_STATUSES,
  TASK_STATUSES,
  RUN_ITEM_STATUSES,
  PRIORITIES,
};

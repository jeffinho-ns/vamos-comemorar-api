'use strict';

const GRUPO_IDEIA_ORG_SLUG = 'grupo-ideia-um';

const SCOPES = ['organization', 'establishment'];

const PRIORITIES = ['baixa', 'normal', 'media', 'alta', 'critica'];

/** Categorias de políticas RH (Fase 1). */
const DOCUMENT_CATEGORIES = [
  'regulamento',
  'lgpd',
  'codigo_conduta',
  'beneficios',
  'manual',
  'certificado',
  'outro',
];

const ROLE_KEYS = [
  'garcom',
  'barman',
  'caixa',
  'cozinha',
  'copa',
  'limpeza',
  'seguranca',
  'recepcao',
  'maitre',
  'runner',
  'gerencia',
  'administrativo',
];

module.exports = {
  GRUPO_IDEIA_ORG_SLUG,
  SCOPES,
  PRIORITIES,
  DOCUMENT_CATEGORIES,
  ROLE_KEYS,
};

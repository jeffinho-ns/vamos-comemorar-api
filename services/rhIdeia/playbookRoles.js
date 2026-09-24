'use strict';

/** Cargos da Parte 4 do Manual Operacional do Seu Justino (v1, agosto/2026). */
const PLAYBOOK_VERSION = 1;
const PASSING_SCORE = 14;
const QUIZ_SIZE = 20;

const PLAYBOOK_ROLES = [
  { key: 'gerente', label: 'Gerente', sector: 'gerencia', leader: true },
  { key: 'chefe_fila', label: 'Chefe de Fila', sector: 'salao', leader: true },
  { key: 'chefe_cozinha', label: 'Chefe de Cozinha', sector: 'cozinha', leader: true },
  { key: 'chefe_bar', label: 'Chefe de Bar', sector: 'bar', leader: true },
  { key: 'cumim', label: 'Cumim', sector: 'salao', leader: false },
  { key: 'suiteiro', label: 'Suiteiro', sector: 'salao', leader: false },
  { key: 'garcom', label: 'Garçom', sector: 'salao', leader: false },
  { key: 'hostess', label: 'Hostess', sector: 'portaria', leader: false },
  { key: 'seguranca', label: 'Segurança', sector: 'portaria', leader: false },
  { key: 'caixa', label: 'Caixa', sector: 'portaria', leader: false },
  { key: 'cozinheiro_lider', label: 'Cozinheiro Líder', sector: 'cozinha', leader: false },
  { key: 'cozinheiro', label: 'Cozinheiro', sector: 'cozinha', leader: false },
  { key: 'auxiliar_cozinha', label: 'Auxiliar de Cozinha', sector: 'cozinha', leader: false },
  { key: 'subchefe_bar', label: 'Subchefe de Bar', sector: 'bar', leader: false },
  { key: 'bartender', label: 'Bartender', sector: 'bar', leader: false },
  { key: 'barback', label: 'Barback', sector: 'bar', leader: false },
  { key: 'estoquista', label: 'Estoquista', sector: 'apoio', leader: false },
  { key: 'limpeza', label: 'Limpeza', sector: 'apoio', leader: false },
  { key: 'manutencao', label: 'Manutenção', sector: 'apoio', leader: false },
  { key: 'nutricionista', label: 'Nutricionista', sector: 'apoio', leader: false },
];

const ROLE_BY_KEY = Object.fromEntries(PLAYBOOK_ROLES.map((role) => [role.key, role]));

const EVAL_CRITERIA = [
  'pontualidade',
  'uniforme',
  'cardapio',
  'agilidade',
  'simpatia',
  'venda',
  'zig',
  'checklists',
  'material',
  'equipe',
  'postura',
  'orientacao',
];

function findRole(roleKey) {
  return ROLE_BY_KEY[String(roleKey || '').trim()] || null;
}

function isLeaderRole(roleKey) {
  return Boolean(findRole(roleKey)?.leader);
}

module.exports = {
  PLAYBOOK_VERSION,
  PASSING_SCORE,
  QUIZ_SIZE,
  PLAYBOOK_ROLES,
  EVAL_CRITERIA,
  findRole,
  isLeaderRole,
};

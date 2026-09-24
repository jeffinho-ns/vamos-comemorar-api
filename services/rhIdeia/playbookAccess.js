'use strict';

const { isLeaderRole } = require('./playbookRoles');

function normalizeUserRole(role) {
  return String(role || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Ver o manual inteiro é do RH de escritório (admin), não do gerente de casa.
 * Gerente com ficha lê só a função dele, mesmo que o módulo RH o trate como gestor.
 */
function resolvePlaybookScope({ isSuperAdmin, userRole, profile }) {
  const role = normalizeUserRole(userRole);
  const office = Boolean(isSuperAdmin) || role === 'admin' || role === 'administrador';
  return {
    seesAll: office,
    mustComplete: Boolean(profile) && !office,
  };
}

function sameEstablishment(profile, chapter) {
  if (!profile || !chapter?.establishment_id) return false;
  return Number(profile.establishment_id) === Number(chapter.establishment_id);
}

/**
 * RH lê o manual inteiro. Os demais só leem o bloco comum da própria casa
 * e os capítulos cuja lista de cargos inclui a função da ficha.
 */
function canReadChapter({ seesAll, profile, chapter }) {
  if (!chapter || chapter.is_current === false) return false;
  if (seesAll) return true;
  if (!sameEstablishment(profile, chapter)) return false;
  if (chapter.audience === 'common') return true;
  if (chapter.audience !== 'role') return false;
  const roles = Array.isArray(chapter.visible_roles) ? chapter.visible_roles : [];
  return roles.includes(profile.role_key);
}

function canSeeAnswerKey({ seesAll, profile }) {
  if (seesAll) return true;
  return Boolean(profile && isLeaderRole(profile.role_key));
}

/**
 * Status da equipe, sem texto de função.
 * Gerente vê a casa inteira. Os outros líderes veem só o próprio setor.
 */
function canSeeTeamMember({ seesAll, actor, member }) {
  if (seesAll) return true;
  if (!actor || !member || !isLeaderRole(actor.role_key)) return false;
  if (Number(actor.establishment_id) !== Number(member.establishment_id)) return false;
  if (actor.role_key === 'gerente') return true;
  return Boolean(actor.sector_key) && actor.sector_key === member.sector_key;
}

module.exports = {
  resolvePlaybookScope,
  canReadChapter,
  canSeeAnswerKey,
  canSeeTeamMember,
};

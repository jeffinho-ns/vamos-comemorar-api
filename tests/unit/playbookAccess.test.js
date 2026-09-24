'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canReadChapter,
  canSeeAnswerKey,
  canSeeTeamMember,
  resolvePlaybookScope,
} = require('../../services/rhIdeia/playbookAccess');
const { gradeAttempt, publicQuestions, QUIZ_BANK } = require('../../services/rhIdeia/playbookQuizBank');

const justino = { establishment_id: 7, is_current: true };
const garcom = { role_key: 'garcom', establishment_id: 7, sector_key: 'salao' };
const gerente = { role_key: 'gerente', establishment_id: 7, sector_key: 'gerencia' };
const chefeFila = { role_key: 'chefe_fila', establishment_id: 7, sector_key: 'salao' };

test('garçom lê a própria ficha e o bloco comum, e não lê o bar', () => {
  const comum = { ...justino, audience: 'common', visible_roles: [] };
  const ficha = { ...justino, audience: 'role', visible_roles: ['garcom'] };
  const bar = { ...justino, audience: 'role', visible_roles: ['bartender'] };
  assert.equal(canReadChapter({ seesAll: false, profile: garcom, chapter: comum }), true);
  assert.equal(canReadChapter({ seesAll: false, profile: garcom, chapter: ficha }), true);
  assert.equal(canReadChapter({ seesAll: false, profile: garcom, chapter: bar }), false);
});

test('gerente de casa não lê a ficha do garçom', () => {
  const ficha = { ...justino, audience: 'role', visible_roles: ['garcom'] };
  assert.equal(canReadChapter({ seesAll: false, profile: gerente, chapter: ficha }), false);
});

test('capítulo de outra casa não aparece', () => {
  const comum = { establishment_id: 9, is_current: true, audience: 'common', visible_roles: [] };
  assert.equal(canReadChapter({ seesAll: false, profile: garcom, chapter: comum }), false);
});

test('RH de escritório lê tudo; gerente com perfil não', () => {
  const office = resolvePlaybookScope({ isSuperAdmin: false, userRole: 'admin', profile: null });
  const floor = resolvePlaybookScope({
    isSuperAdmin: false,
    userRole: 'gerente',
    profile: gerente,
  });
  assert.equal(office.seesAll, true);
  assert.equal(floor.seesAll, false);
  assert.equal(floor.mustComplete, true);
});

test('gabarito fica com líder e RH, não com o garçom', () => {
  assert.equal(canSeeAnswerKey({ seesAll: false, profile: garcom }), false);
  assert.equal(canSeeAnswerKey({ seesAll: false, profile: chefeFila }), true);
  assert.equal(canSeeAnswerKey({ seesAll: true, profile: null }), true);
});

test('chefe de fila vê o status do salão e não o da cozinha', () => {
  const cozinha = { establishment_id: 7, sector_key: 'cozinha', role_key: 'cozinheiro' };
  const salao = { establishment_id: 7, sector_key: 'salao', role_key: 'garcom' };
  assert.equal(canSeeTeamMember({ seesAll: false, actor: chefeFila, member: salao }), true);
  assert.equal(canSeeTeamMember({ seesAll: false, actor: chefeFila, member: cozinha }), false);
  assert.equal(canSeeTeamMember({ seesAll: false, actor: gerente, member: cozinha }), true);
});

test('prova devolve nota sem o índice correto e passa com 14', () => {
  const hidden = publicQuestions(QUIZ_BANK.map((q, i) => ({ ...q, id: i + 1 })));
  assert.equal('correct' in hidden[0], false);
  const allRight = QUIZ_BANK.map((q) => ({ slug: q.slug, option: q.correct }));
  const passed = gradeAttempt(QUIZ_BANK, allRight);
  assert.equal(passed.score, 20);
  assert.equal(passed.passed, true);
  const fourteen = allRight.map((item, index) => (index < 14 ? item : { ...item, option: 99 }));
  assert.equal(gradeAttempt(QUIZ_BANK, fourteen).passed, true);
  const thirteen = allRight.map((item, index) => (index < 13 ? item : { ...item, option: 99 }));
  assert.equal(gradeAttempt(QUIZ_BANK, thirteen).passed, false);
});

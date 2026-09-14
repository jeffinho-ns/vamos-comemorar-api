'use strict';

/**
 * Testes offline do modo guia / playbooks.
 * Rode: node tests/unit/staffAgentPlaybooks.test.js
 */

const assert = require('assert');
const {
  detectPlaybookIntent,
  getPlaybookById,
  formatPlaybookForPrompt,
  listPlaybookIds,
} = require('../../services/staffAgent/playbooks');
const {
  isGuideContinueText,
  isGuideCancelText,
  upsertGuideSession,
  getGuideSession,
  clearGuideSession,
  inferNextStepIndex,
} = require('../../services/staffAgent/guideSessions');

assert.ok(listPlaybookIds().includes('criar_item_cardapio'));

assert.equal(detectPlaybookIntent('quero criar um item novo no cardápio')?.id, 'criar_item_cardapio');
assert.equal(detectPlaybookIntent('cadastrar um prato novo')?.id, 'criar_item_cardapio');
assert.equal(detectPlaybookIntent('criar uma reserva para o João')?.id, 'criar_reserva');
assert.equal(detectPlaybookIntent('enviar mensagem no whatsapp')?.id, 'enviar_whatsapp');
assert.equal(detectPlaybookIntent('assumir a conversa do cliente')?.id, 'enviar_whatsapp');

// Não confundir com tools existentes
assert.equal(detectPlaybookIntent('pausar a caipirinha'), null);
assert.equal(detectPlaybookIntent('reativar o prato japão'), null);
assert.equal(detectPlaybookIntent('como estão as reservas do final de semana'), null);
assert.equal(detectPlaybookIntent('quem está na espera'), null);

const pb = getPlaybookById('criar_item_cardapio');
const block = formatPlaybookForPrompt(pb, { stepIndex: 0 });
assert.ok(block.includes('/admin/cardapio'));
assert.ok(block.includes('GUIA ATIVO'));

assert.equal(isGuideContinueText('pronto'), true);
assert.equal(isGuideContinueText('já fiz'), true);
assert.equal(isGuideContinueText('parei na categoria'), true);
assert.equal(isGuideCancelText('cancelar guia'), true);
assert.equal(isGuideContinueText('como está o dia de hoje'), false);

clearGuideSession(99, 7);
upsertGuideSession({
  userId: 99,
  establishmentId: 7,
  playbookId: 'criar_item_cardapio',
  stepIndex: 2,
  lastReply: 'Abra o cardápio',
});
const sess = getGuideSession(99, 7);
assert.equal(sess.playbookId, 'criar_item_cardapio');
assert.equal(sess.stepIndex, 2);
clearGuideSession(99, 7);
assert.equal(getGuideSession(99, 7), null);

assert.equal(inferNextStepIndex('Vamos ao passo 3', 0, 6), 2);
assert.equal(inferNextStepIndex('ok', 1, 6), 2);

console.log('✅ staffAgentPlaybooks: detecção e sessão de guia ok');

const test = require('node:test');
const assert = require('node:assert/strict');
const { isAgentModeEnabled} = require('../../services/agent/agentMode');
const { buildSummaryFromWorkingState } = require('../../services/agent/agentMemoryService');

test('modo agente ativo por padrão', () => {
  const previous = process.env.WHATSAPP_AGENT_MODE;
  delete process.env.WHATSAPP_AGENT_MODE;
  delete require.cache[require.resolve('../../services/agent/agentMode')];
  const { isAgentModeEnabled: freshCheck } = require('../../services/agent/agentMode');
  assert.equal(freshCheck(), true);
  process.env.WHATSAPP_AGENT_MODE = previous;
});

test('memória resume decisões já tomadas', () => {
  const summary = buildSummaryFromWorkingState({
    establishment_id: 9,
    reservation_date: '2026-05-16',
    reservation_time: '17:00',
  });
  assert.ok(summary.includes('estabelecimento: 9'));
  assert.ok(summary.includes('2026-05-16'));
});

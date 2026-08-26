'use strict';

/**
 * Smoke tests offline do catálogo Fase 1 (sem Groq/DB).
 */

const assert = require('assert');
const {
  getPhase1ToolDefinitions,
  getPhase1ToolByName,
  getPhase1Meta,
  PHASE1_TOOLS,
  PHASE1_EXCLUDED,
} = require('../../services/staffAgent/phase1ToolCatalog');
const {
  isEstablishmentEnabled,
  isAllowAllMode,
  parseAllowedIds,
} = require('../../services/staffAgent/featureFlag');

assert.equal(PHASE1_TOOLS.length, 10, 'Fase 1 deve ter 10 tools');
assert.ok(PHASE1_EXCLUDED.includes('criar_reserva'));
assert.ok(getPhase1ToolByName('briefing_turno'));
assert.ok(!getPhase1ToolByName('criar_reserva'));

const defs = getPhase1ToolDefinitions();
assert.equal(defs.length, 10);
assert.equal(defs[0].type, 'function');
assert.ok(defs[0].function.name);

const meta = getPhase1Meta();
assert.equal(meta.phase, 1);
assert.equal(meta.providerHint, 'groq');

delete process.env.STAFF_AGENT_PHASE1_STRICT;

// Piloto: qualquer valor não-vazio libera todas as casas.
process.env.STAFF_AGENT_PHASE1_ESTABLISHMENT_IDS = '1';
assert.equal(isAllowAllMode(), true);
assert.equal(isEstablishmentEnabled(1), true);
assert.equal(isEstablishmentEnabled(4), true);
assert.equal(isEstablishmentEnabled(7), true);
assert.equal(isEstablishmentEnabled(8), true);
assert.equal(isEstablishmentEnabled(9), true);
assert.equal(isEstablishmentEnabled(17), true);

process.env.STAFF_AGENT_PHASE1_ESTABLISHMENT_IDS = '*';
assert.equal(isAllowAllMode(), true);
assert.equal(isEstablishmentEnabled(7), true);

process.env.STAFF_AGENT_PHASE1_ESTABLISHMENT_IDS = '1,7';
assert.deepEqual(parseAllowedIds(), [1, 7]);
assert.equal(isAllowAllMode(), true);
assert.equal(isEstablishmentEnabled(9), true);

// STRICT=true volta a ser whitelist.
process.env.STAFF_AGENT_PHASE1_STRICT = 'true';
process.env.STAFF_AGENT_PHASE1_ESTABLISHMENT_IDS = '1';
assert.equal(isAllowAllMode(), false);
assert.equal(isEstablishmentEnabled(1), true);
assert.equal(isEstablishmentEnabled(7), false);
delete process.env.STAFF_AGENT_PHASE1_STRICT;

console.log('staffAgentPhase1Catalog.test.js OK');

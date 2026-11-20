'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  assertSensitiveOpAllowed,
  detectIntegrationTypeFromPayload,
  observeConnectionEvent,
  getSessionApiInventory,
} = require('../../services/wame/wameCoexistenceGuard');
const {
  getCoexistenceFlags,
  shouldSuspendSolOutbound,
  listProtectedEstablishmentIds,
} = require('../../services/wame/wameCoexistenceFlags');
const {
  clearSensitiveOpAuditForTests,
  getRecentSensitiveOps,
} = require('../../services/wame/wameSensitiveOpAudit');

const ENV_KEYS = [
  'WAME_COEXISTENCE_FLAGS',
  'WAME_COEXISTENCE_PROTECTED_IDS',
  'WAME_COEXISTENCE_SUSPEND_SOL_OUTBOUND_IDS',
  'WAME_COEXISTENCE_DISABLE_DEFAULTS',
  'HIGHLINE_ESTABLISHMENT_ID',
];

const savedEnv = {};

function snapshotEnv() {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
  }
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] == null) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
}

describe('wameCoexistenceGuard', () => {
  beforeEach(() => {
    snapshotEnv();
    clearSensitiveOpAuditForTests();
    delete process.env.WAME_COEXISTENCE_FLAGS;
    delete process.env.WAME_COEXISTENCE_PROTECTED_IDS;
    delete process.env.WAME_COEXISTENCE_SUSPEND_SOL_OUTBOUND_IDS;
    delete process.env.WAME_COEXISTENCE_DISABLE_DEFAULTS;
    process.env.HIGHLINE_ESTABLISHMENT_ID = '7';
  });

  afterEach(() => {
    restoreEnv();
    clearSensitiveOpAuditForTests();
  });

  it('protege Highline por default sem suspender SOL outbound', () => {
    const flags = getCoexistenceFlags(7);
    assert.equal(flags.protectSession, true);
    assert.equal(flags.blockPhoneLineAdmin, true);
    assert.equal(flags.suspendSolOutbound, false);
    assert.equal(shouldSuspendSolOutbound(7), false);
    assert.ok(listProtectedEstablishmentIds().includes(7));
  });

  it('não altera outras casas por default', () => {
    assert.equal(getCoexistenceFlags(1), null);
    assert.doesNotThrow(() =>
      assertSensitiveOpAllowed({ op: 'official_sync', establishmentId: 1 }),
    );
  });

  it('bloqueia official_sync da Highline sem autorização explícita', () => {
    assert.throws(
      () => assertSensitiveOpAllowed({ op: 'official_sync', establishmentId: 7 }),
      (error) => error.code === 'WAME_COEXISTENCE_BLOCKED' && error.statusCode === 403,
    );
    const recent = getRecentSensitiveOps({ establishmentId: 7 });
    assert.equal(recent.at(-1)?.outcome, 'blocked');
  });

  it('permite official_sync com confirm_destructive + reason', () => {
    const result = assertSensitiveOpAllowed({
      op: 'official_sync',
      establishmentId: 7,
      req: {
        body: {
          confirm_destructive: true,
          destructive_reason: 'aprovado-projeto-highline',
        },
        headers: {},
      },
      actorUserId: 99,
    });
    assert.equal(result.allowed, true);
    assert.equal(result.explicitAuth.authorized, true);
    assert.equal(getRecentSensitiveOps({ establishmentId: 7 }).at(-1)?.outcome, 'allowed_with_explicit_auth');
  });

  it('bloqueia disconnect da linha Meta da Highline', () => {
    assert.throws(
      () =>
        assertSensitiveOpAllowed({
          op: 'phone_line_disconnect',
          establishmentId: 7,
          req: { body: {}, headers: {} },
        }),
      (error) => error.code === 'WAME_COEXISTENCE_BLOCKED',
    );
  });

  it('suspendSolOutbound só quando a lista/env liga', () => {
    process.env.WAME_COEXISTENCE_SUSPEND_SOL_OUTBOUND_IDS = '7';
    assert.equal(shouldSuspendSolOutbound(7), true);
    assert.equal(shouldSuspendSolOutbound(1), false);
  });

  it('WAME_COEXISTENCE_DISABLE_DEFAULTS desliga proteção Highline', () => {
    process.env.WAME_COEXISTENCE_DISABLE_DEFAULTS = 'true';
    assert.equal(getCoexistenceFlags(7), null);
    assert.doesNotThrow(() =>
      assertSensitiveOpAllowed({ op: 'official_sync', establishmentId: 7 }),
    );
  });

  it('detecta oficial vs QR pelo campo official do webhook', () => {
    assert.equal(detectIntegrationTypeFromPayload({ official: true }), 'official');
    assert.equal(detectIntegrationTypeFromPayload({ official: false }), 'qr_unofficial');
    assert.equal(
      detectIntegrationTypeFromPayload({
        entry: [{ changes: [{ field: 'history' }] }],
      }),
      'official_coexistence_signals',
    );
  });

  it('observa connection sem PII e inventário não inventa endpoints', () => {
    observeConnectionEvent({
      establishmentId: 7,
      payload: {
        official: true,
        entry: [{ changes: [{ field: 'connection', value: { status: 'connected' } }] }],
      },
    });
    const last = getRecentSensitiveOps({ establishmentId: 7 }).at(-1);
    assert.equal(last.op, 'webhook_connection');
    assert.equal(last.detail.status, 'connected');
    assert.equal(last.detail.official, true);
    assert.equal(Object.prototype.hasOwnProperty.call(last.detail, 'phone'), false);

    const inventory = getSessionApiInventory();
    assert.ok(inventory.notWrappedDoNotAutoCall.includes('POST /{key}/instance/restart'));
    assert.match(inventory.officialSyncNote, /não listado no swagger/i);
  });
});

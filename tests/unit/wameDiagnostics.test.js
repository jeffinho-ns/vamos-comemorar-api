'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  maskPhone,
  maskId,
  buildWameLog,
  correlationHints,
} = require('../../services/wame/wameDiagnostics');

describe('wameDiagnostics', () => {
  it('mascara telefone e ids sem expor PII', () => {
    assert.equal(maskPhone('5511988776655'), '••••6655');
    assert.equal(maskId('highlineKey7', { keep: 6 }), `••••${'highlineKey7'.slice(-6)}`);
    assert.doesNotMatch(maskPhone('5511988776655'), /5511988776655/);
    assert.doesNotMatch(maskId('highlineKey7', { keep: 6 }), /highlineKey7/);
  });

  it('buildWameLog nunca inclui texto de mensagem nem token', () => {
    const log = buildWameLog('send.retry', {
      establishmentId: 7,
      instanceId: 'highlineSecretKey99',
      waId: '5511988776655',
      wamid: 'wamid.ABCDEFGH123',
      server: 'https://us.api-wa.me',
      status: 401,
      durationMs: 12.4,
      reason: 'unauthorized',
      outcome: 'retry_next_server',
      text: 'mensagem secreta do cliente',
      token: 'Bearer abc.def',
      access_token: 'meta-token',
      body: { text: 'oi' },
    });

    const serialized = JSON.stringify(log);
    assert.equal(log.scope, 'wame');
    assert.equal(log.event, 'send.retry');
    assert.equal(log.establishmentId, 7);
    assert.equal(log.status, 401);
    assert.equal(log.durationMs, 12);
    assert.equal(log.serverHost, 'us.api-wa.me');
    assert.doesNotMatch(serialized, /mensagem secreta/i);
    assert.doesNotMatch(serialized, /Bearer/i);
    assert.doesNotMatch(serialized, /meta-token/i);
    assert.doesNotMatch(serialized, /5511988776655/);
    assert.doesNotMatch(serialized, /highlineSecretKey99/);
    assert.ok(!('text' in log));
    assert.ok(!('token' in log));
  });

  it('rejeita evento inválido', () => {
    assert.throws(() => buildWameLog('BAD EVENT'), /inválido/i);
  });

  it('correlationHints devolve só máscaras', () => {
    const hints = correlationHints({
      establishmentId: 7,
      instanceId: 'highlineKey7',
      wamid: 'wamid.XYZ',
      waId: '5511988776655',
    });
    assert.equal(hints.establishmentId, 7);
    assert.match(hints.instanceIdHint, /^••••/);
    assert.match(hints.wamidHint, /^••••/);
    assert.match(hints.waIdHint, /^••••/);
  });
});

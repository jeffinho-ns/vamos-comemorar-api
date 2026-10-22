const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.BI_JUSTINO_BRIDGE_SECRET = 'ponte-de-teste';

const { canOpenBiJustino, profileFor, signBridgeProof } = require('../../services/biJustinoAccess');

test('só as contas combinadas abrem o BI', () => {
  assert.equal(canOpenBiJustino('jeffinho_ns@hotmail.com'), true);
  assert.equal(canOpenBiJustino(' LuisFelipe@ideiaum.com.br '), true);
  assert.equal(canOpenBiJustino('coordenadora.reservas@ideiaum.com.br'), true);
  assert.equal(canOpenBiJustino('renatocury@ideiaum.com.br'), true);
  assert.equal(canOpenBiJustino('recepcao@seujustino.com.br'), false);
  assert.equal(canOpenBiJustino('renato@ideiaum.com.br'), false);
});

test('a prova da ponte carrega e-mail, papel e prazo', () => {
  const profile = profileFor('coordenadora.reservas@ideiaum.com.br', false);
  assert.equal(profile.role, 'user');
  const proof = signBridgeProof(profile);
  assert.ok(proof);
  const [body, sig] = proof.split('.');
  const payload = Buffer.from(body, 'base64url').toString('utf8');
  const expected = crypto.createHmac('sha256', 'ponte-de-teste').update(payload, 'utf8').digest('hex');
  assert.equal(sig, expected);
  const parts = payload.split('|');
  assert.equal(parts[0], 'coordenadora.reservas@ideiaum.com.br');
  assert.equal(parts[1], 'user');
  assert.equal(parts[2], 'all');
  assert.ok(Number(parts[3]) > Date.now());
});

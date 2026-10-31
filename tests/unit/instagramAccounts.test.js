const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractInstagramAccountIds,
  extractInstagramInbound,
} = require('../../services/instagram/instagramWebhookParse');
const {
  maskToken,
  toPublicAccount,
  normalizeIgId,
  pickAccountFromRows,
} = require('../../services/instagram/instagramAccountService');

test('extrai o Instagram da casa no webhook Direct', () => {
  const payload = {
    object: 'instagram',
    entry: [
      {
        id: '17841411111111',
        messaging: [
          {
            sender: { id: '555' },
            recipient: { id: '17841411111111' },
            message: { mid: 'm1', text: 'Oi' },
          },
        ],
      },
    ],
  };
  assert.deepEqual(extractInstagramAccountIds(payload), ['17841411111111']);
  assert.equal(extractInstagramInbound(payload).accountId, '17841411111111');
});

test('máscara do token nunca devolve o valor inteiro', () => {
  assert.equal(maskToken('IGQWx1234abcd'), '••••abcd');
  assert.equal(maskToken(''), null);
  const pub = toPublicAccount({
    establishment_id: 7,
    ig_user_id: '17841411111111',
    page_id: '999',
    username: 'highline',
    access_token: 'IGQWx1234abcd',
    is_active: true,
  });
  assert.equal(pub.has_token, true);
  assert.equal(pub.token_hint, '••••abcd');
  assert.equal(pub.access_token, undefined);
  assert.equal(normalizeIgId('ig:17841411111111'), '17841411111111');
});

test('envio usa o token da casa e não o token global', async () => {
  const { resolveSendCredentials } = require('../../services/instagram/instagramService');
  const prev = process.env.IG_ACCESS_TOKEN;
  process.env.IG_ACCESS_TOKEN = 'GLOBALTOKEN';
  try {
    const house = await resolveSendCredentials({
      lookupAccount: async () => ({ access_token: 'HOUSETOKEN', ig_user_id: '222' }),
      establishmentId: 7,
    });
    assert.equal(house.accessToken, 'HOUSETOKEN');
    assert.equal(house.igUserId, '222');
  } finally {
    if (prev === undefined) delete process.env.IG_ACCESS_TOKEN;
    else process.env.IG_ACCESS_TOKEN = prev;
  }
});

test('escolhe a conta da casa pelo ig_user_id ou page_id', () => {
  const rows = [
    { establishment_id: 1, ig_user_id: '111', page_id: 'aaa', is_active: true },
    { establishment_id: 7, ig_user_id: '222', page_id: 'bbb', is_active: true },
  ];
  assert.equal(pickAccountFromRows(rows, ['222']).establishment_id, 7);
  assert.equal(pickAccountFromRows(rows, ['bbb']).establishment_id, 7);
  assert.equal(pickAccountFromRows(rows, ['zzz']), null);
});

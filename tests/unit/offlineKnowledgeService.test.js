const test = require('node:test');
const assert = require('node:assert/strict');
const {
  tryOfflineKnowledgeReply,
  loadOfflinePackSync,
  resolvePackFileName,
} = require('../../services/agent/offlineKnowledgeService');

test('loadOfflinePackSync carrega highline.json e responde horário', async () => {
  const pack = loadOfflinePackSync(7, 'HighLine');
  assert.ok(pack);
  assert.equal(pack.slug, 'highline');
  assert.ok(Array.isArray(pack.topics));
  assert.ok(pack.topics.some((item) => item.topic === 'dias_horarios_funcionamento'));

  const pool = {
    async query() {
      return { rows: [] };
    },
  };

  const result = await tryOfflineKnowledgeReply(pool, {
    establishmentId: 7,
    establishmentName: 'HighLine',
    userText: 'Oi, qual o horário de funcionamento?',
    messageHistory: [],
  });

  assert.equal(result.ok, true);
  assert.equal(result.source, 'file');
  assert.equal(result.topic, 'dias_horarios_funcionamento');
  assert.match(result.text, /16h/i);
});

test('pack da Pracinha (id 8) responde pergunta de horário', async () => {
  const pack = loadOfflinePackSync(8, 'Pracinha');
  assert.ok(pack);
  assert.equal(pack.slug, 'pracinha');
  assert.equal(resolvePackFileName(8, 'Pracinha'), '8.json');

  const pool = {
    async query() {
      return { rows: [] };
    },
  };

  const result = await tryOfflineKnowledgeReply(pool, {
    establishmentId: 8,
    establishmentName: 'Pracinha',
    userText: 'Qual o horário de funcionamento?',
    messageHistory: [],
  });

  assert.equal(result.ok, true);
  assert.equal(result.source, 'file');
  assert.match(result.text, /Pracinha/i);
  assert.match(result.text, /horário|horario/i);
});

test('id desconhecido sem DB usa default.json', async () => {
  assert.equal(resolvePackFileName(999, 'Casa Nova'), 'default.json');

  const result = await tryOfflineKnowledgeReply(null, {
    establishmentId: 999,
    establishmentName: 'Casa Nova',
    userText: 'Qual o horário de funcionamento?',
    messageHistory: [],
  });

  assert.equal(result.ok, true);
  assert.equal(result.source, 'file');
  assert.match(result.text, /equipe/i);
});

test('tryOfflineKnowledgeReply retorna ok:false para input vazio', async () => {
  const result = await tryOfflineKnowledgeReply(null, {
    establishmentId: 7,
    establishmentName: 'HighLine',
    userText: '   ',
    messageHistory: [],
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'empty_input');
});

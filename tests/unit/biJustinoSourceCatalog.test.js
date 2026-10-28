const test = require('node:test');
const assert = require('node:assert/strict');
const { listSources, findSource } = require('../../services/biJustino/sourceCatalog');
const { missingCredentialNames } = require('../../services/biJustino/appsScriptClient');

test('sem senha, o faturamento ainda não é coletável', () => {
  const fontes = listSources({});
  const faturamento = fontes.find((item) => item.id === 'faturamento_zig');
  assert.equal(faturamento.coletavel, false);
  assert.equal(faturamento.aguardandoCredencial, true);
  assert.equal(faturamento.variaveis.some((item) => item.name === 'BI_APPS_SCRIPT_PASSWORD' && item.preenchida), false);
  const dumped = JSON.stringify(fontes);
  assert.equal(dumped.includes('senha-secreta'), false);
});

test('com as três variáveis, a fonte do faturamento fica pronta', () => {
  const fontes = listSources({
    BI_APPS_SCRIPT_URL: 'https://script.google.com/macros/s/exemplo/exec',
    BI_APPS_SCRIPT_EMAIL: 'painel@seujustino.com.br',
    BI_APPS_SCRIPT_PASSWORD: 'senha-secreta',
  });
  const faturamento = fontes.find((item) => item.id === 'faturamento_zig');
  assert.equal(faturamento.coletavel, true);
  assert.equal(JSON.stringify(fontes).includes('senha-secreta'), false);
});

test('a DRE e o robô da Zig ainda não são coletados nesta etapa', () => {
  assert.equal(findSource('dre_sharepoint').coletavel, false);
  assert.equal(findSource('zig_robo').coletavel, false);
  assert.deepEqual(missingCredentialNames({}), ['BI_APPS_SCRIPT_EMAIL', 'BI_APPS_SCRIPT_PASSWORD']);
  assert.deepEqual(missingCredentialNames({ ROBOT_EMAIL: 'robo@seujustino.local', ROBOT_PASSWORD: 'segredo' }), []);
});

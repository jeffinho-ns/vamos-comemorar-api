const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validarEnvio, validarApagar, validarFechamento, normalizarData, numeroBr, CAMPOS_NUMERICOS,
} = require('../../services/biJustino/financeiro/envioMensal');

test('numeroBr aceita número, texto brasileiro e recusa lixo', () => {
  assert.equal(numeroBr(1234.5), 1234.5);
  assert.equal(numeroBr('1.234,56'), 1234.56);
  assert.equal(numeroBr('R$ 51.613,00'), 51613);
  assert.equal(numeroBr(''), 0);
  assert.equal(numeroBr('abc'), null);
  assert.equal(numeroBr(Number.NaN), null);
});

test('áreas mensais gravam sempre no dia 01 do mês (mesma chave do painel)', () => {
  assert.equal(normalizarData('financeiro', '2026-10'), '2026-10-01');
  assert.equal(normalizarData('rh', '2026-10-17'), '2026-10-01');
  assert.equal(normalizarData('cmv', '2026-10-17'), '2026-10-17');
  assert.equal(normalizarData('cmv', '2026-10'), null);
  assert.equal(normalizarData('financeiro', '17/10/2026'), null);
});

test('envio financeiro valida campos, converte valores e só aceita as chaves da área', () => {
  const r = validarEnvio('financeiro', {
    date: '2026-10',
    submittedByName: '  Renato   Cury ',
    values: { fnTax: '3,86', fnRent: 51613, fnEnergy: '10.000,00', campoEstranho: 99 },
  });
  assert.equal(r.ok, true);
  assert.equal(r.payload.area, 'financeiro');
  assert.equal(r.payload.date, '2026-10-01');
  assert.equal(r.payload.submittedByName, 'Renato Cury');
  assert.equal(r.payload.values.fnTax, 3.86);
  assert.equal(r.payload.values.fnEnergy, 10000);
  assert.equal(r.payload.values.fnCard, 0);
  assert.equal('campoEstranho' in r.payload.values, false);
  assert.deepEqual(Object.keys(r.payload.values), CAMPOS_NUMERICOS.financeiro);
});

test('envio recusa área desconhecida, data inválida, valor não numérico e registro em branco', () => {
  assert.equal(validarEnvio('marketing', { date: '2026-10' }).error, 'area_invalida');
  assert.equal(validarEnvio('rh', { date: 'ontem' }).error, 'data_invalida');
  assert.equal(validarEnvio('rh', { date: '2026-10', values: { rhCore: 'x' } }).error, 'valor_invalido:rhCore');
  assert.equal(validarEnvio('rh', { date: '2026-10', values: {} }).error, 'registro_em_branco');
});

test('envio cmv guarda a nota e ignora notas de outras áreas', () => {
  const r = validarEnvio('cmv', { date: '2026-10-17', values: { cmvSales: 1000 }, notes: { cmvNote: ' ok ', mkNote: 'x' } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.payload.notes, { cmvNote: 'ok' });
});

test('apagar exige datas válidas, remove duplicadas e limita a quantidade', () => {
  assert.equal(validarApagar('financeiro', {}).error, 'datas_ausentes');
  assert.equal(validarApagar('financeiro', { dates: ['2026-10'] }).error, 'datas_ausentes');
  const r = validarApagar('rh', { dates: ['2026-10-01', '2026-10-01', '2026-09-01'] });
  assert.deepEqual(r.datas, ['2026-10-01', '2026-09-01']);
  assert.equal(validarApagar('rh', { date: '2026-08-01' }).datas[0], '2026-08-01');
  const muitas = Array.from({ length: 70 }, (_, i) => `2026-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`);
  assert.equal(validarApagar('rh', { dates: muitas }).error, 'datas_demais');
  assert.equal(validarApagar('rh', { dates: ['2026-10-01', 'x'] }).datas.length, 1);
});

test('fechamento de mês vale para financeiro/rh/cmv e exige ação e mês válidos', () => {
  assert.equal(validarFechamento('marketing', { acao: 'fechar', monthKey: '2026-09' }).error, 'area_invalida');
  assert.equal(validarFechamento('rh', { acao: 'fechar', monthKey: '2026-13' }).error, 'mes_invalido');
  assert.equal(validarFechamento('rh', { acao: 'trancar', monthKey: '2026-09' }).error, 'acao_invalida');
  const fechar = validarFechamento('rh', { acao: 'fechar', monthKey: '2026-09-01' });
  assert.deepEqual(fechar, { ok: true, action: 'closeMonth', payload: { area: 'rh', monthKey: '2026-09' } });
  assert.equal(validarFechamento('financeiro', { acao: 'reabrir', monthKey: '2026-09' }).action, 'reopenMonth');
  assert.equal(validarFechamento('cmv', { acao: 'fechar', monthKey: '2026-09' }).action, 'closeMonth');
});

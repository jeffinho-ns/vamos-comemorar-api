'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const registro = require('../../services/biJustino/operacao/registroDia');
const auditoriaOp = require('../../services/biJustino/operacao/auditoriaOp');
const sistema = require('../../services/biJustino/sistema/validacao');
const { deArquivo } = require('../../services/biJustino/sistema/uploadBase64');
const { ESCRITAS, chavesDe } = require('../../services/biJustino/operacao/escritas');
const { encontrarLeitura } = require('../../services/biJustino/espelho/catalogo');
const { BLOQUEADAS } = require('../../services/biJustino/espelho/escrita');

function escrita(action) {
  return ESCRITAS.find((e) => e.action === action);
}

test('reabrir mês reusa a validação de fechar e só a Diretoria chama', () => {
  const rota = escrita('reopenMonth');
  assert.ok(rota);
  assert.equal(rota.caminho, '/justino/operacao/reabrir-mes');
  assert.equal(rota.aprovacao, true);
  assert.equal(registro.validarFecharMes({ area: 'operacao', monthKey: '2026-09' }).erro, undefined);
  assert.deepEqual(chavesDe(rota, { area: 'operacao' }), ['getMonthClosures:operacao']);
  assert.deepEqual(chavesDe(rota, { area: 'auditoriaop' }), ['getMonthClosures:auditoriaop']);
});

test('presença diária de CLT/INT/PJ exige funcionário, data e algo pra gravar', () => {
  assert.equal(registro.validarPresencaDiaria({}).erro, 'funcionario_invalido');
  assert.equal(registro.validarPresencaDiaria({ employeeId: 'e1' }).erro, 'data_invalida');
  assert.equal(registro.validarPresencaDiaria({ employeeId: 'e1', date: '2026-10-30' }).erro, 'nada_para_gravar');
  assert.equal(registro.validarPresencaDiaria({ employeeId: 'e1', date: '2026-10-30', status: 'atrasado' }).erro, 'status_invalido');
  assert.deepEqual(
    registro.validarPresencaDiaria({ employeeId: 'e1', date: '2026-10-30', status: 'faltou' }).payload,
    { employeeId: 'e1', date: '2026-10-30', status: 'faltou' },
  );
  assert.equal(
    registro.validarPresencaDiaria({ employeeId: 'e1', date: '2026-10-30', observacao: 'chegou tarde' }).payload.observacao,
    'chegou tarde',
  );
  const rota = escrita('setDailyAttendance');
  assert.ok(rota);
  chavesDe(rota, {}).forEach((chave) => assert.ok(encontrarLeitura(chave), chave));
});

test('upload de evidência e de documento exige id e base64, e vira ação permitida', () => {
  assert.equal(auditoriaOp.validarUpload({}).erro, 'id_invalido');
  assert.equal(auditoriaOp.validarUpload({ itemId: 'it1' }).erro, 'arquivo_obrigatorio');
  const ev = auditoriaOp.validarUpload({
    itemId: 'it1',
    fileBase64: 'aGVsbG8td29ybGQtZm90bw==',
    fileName: 'antes.jpg',
    mimeType: 'image/jpeg',
    antesDepois: 'depois',
    descricao: ' pia ',
  });
  assert.equal(ev.payload.antesDepois, 'depois');
  assert.equal(ev.payload.descricao, 'pia');
  assert.equal(sistema.validarUploadArquivo({ id: 'd1' }).erro, 'arquivo_obrigatorio');
  const doc = sistema.validarUploadArquivo({ id: 'd1', fileBase64: 'aGVsbG8tZG9jdW1lbnRv', fileName: 'alvara.pdf' });
  assert.equal(doc.payload.fileName, 'alvara.pdf');
  assert.equal(escrita('uploadAuditoriaOpEvidencia').multipart, true);
  assert.equal(escrita('uploadDocumentacaoFile').multipart, true);
});

test('helper de upload converte o buffer do multer em base64 e recusa vazio', () => {
  assert.equal(deArquivo(null).erro, 'arquivo_obrigatorio');
  assert.equal(deArquivo({ buffer: Buffer.alloc(0) }).erro, 'arquivo_obrigatorio');
  const ok = deArquivo({ buffer: Buffer.from('abc'), originalname: 'foto/antes.jpg', mimetype: 'image/jpeg' });
  assert.equal(ok.fileBase64, Buffer.from('abc').toString('base64'));
  assert.equal(ok.fileName, 'foto-antes.jpg');
  assert.equal(ok.mimeType, 'image/jpeg');
});

test('escritas da área não proxyam ações bloqueadas nem leituras get*', () => {
  ['deleteUser', 'addAccount', 'changeMyPassword', 'setUserAreas'].forEach((acao) => {
    assert.ok(BLOQUEADAS.has(acao), acao);
    assert.equal(escrita(acao), undefined);
  });
  ESCRITAS.forEach((e) => {
    assert.ok(!/^get/.test(e.action), e.action);
    assert.ok(!BLOQUEADAS.has(e.action), e.action);
    const chaves = chavesDe(e, { area: 'operacao', itemId: 'x' });
    chaves.forEach((chave) => assert.ok(encontrarLeitura(chave), `${e.caminho} → ${chave}`));
  });
});

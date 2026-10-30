const test = require('node:test');
const assert = require('node:assert/strict');
const { validarReuniao, validarApagarReuniao } = require('../../services/biJustino/marketing/reunioes');
const { validarAtivacao, validarApagarAtivacao } = require('../../services/biJustino/marketing/instagram');
const { validarDecisao, validarSugestao, validarLote } = require('../../services/biJustino/marketing/avaliacoes');
const { validarRanking } = require('../../services/biJustino/marketing/bandas');
const { validarSnapshot99 } = require('../../services/biJustino/marketing/delivery');
const {
  validarFechamentoMes, validarDecisaoAuditoria, validarRespostaDuvida, validarNovaDuvida,
} = require('../../services/biJustino/marketing/diretoria');

test('demanda exige título, normaliza tipo/status e limpa campos que não pertencem ao tipo', () => {
  assert.equal(validarReuniao({ titulo: '  ' }).erro, 'titulo_obrigatorio');
  assert.equal(validarReuniao({ titulo: 'x', dataReuniao: '30/10/2026' }).erro, 'data_invalida');
  assert.equal(validarReuniao({ titulo: 'x', prazo: 'amanhã' }).erro, 'prazo_invalido');
  assert.equal(validarReuniao({ titulo: 'x', id: 'a b' }).erro, 'id_invalido');
  const ok = validarReuniao({
    titulo: ' Calendário ', tipo: 'demanda', status: 'qualquer', prioridade: 'alta',
    participantes: 'Ana, Bia', decisoes: 'nada', reuniaoId: 'abc-123', prazo: '2026-11-05',
  });
  assert.equal(ok.payload.titulo, 'Calendário');
  assert.equal(ok.payload.status, 'aberto');
  assert.equal(ok.payload.participantes, '');
  assert.equal(ok.payload.decisoes, '');
  assert.equal(ok.payload.reuniaoId, 'abc-123');
  const ata = validarReuniao({ titulo: 'Ata', tipo: 'ata', participantes: 'Ana', decisoes: 'Fazer X', reuniaoId: 'zzz' });
  assert.equal(ata.payload.participantes, 'Ana');
  assert.equal(ata.payload.decisoes, 'Fazer X');
  assert.equal(ata.payload.reuniaoId, '');
  assert.equal(validarApagarReuniao({}).erro, 'id_invalido');
  assert.deepEqual(validarApagarReuniao({ id: 'uuid-1' }).payload, { id: 'uuid-1' });
});

test('ativação do Instagram exige data e título e aceita só tipos conhecidos', () => {
  assert.equal(validarAtivacao({ titulo: 'Reel' }).erro, 'data_invalida');
  assert.equal(validarAtivacao({ data: '2026-10-30' }).erro, 'titulo_obrigatorio');
  const ok = validarAtivacao({ data: '2026-10-30', titulo: 'Reel de convite', tipo: 'video', postId: '178<script>' });
  assert.equal(ok.payload.tipo, 'outro');
  assert.equal(ok.payload.postId, '178script');
  assert.equal(validarApagarAtivacao({ id: '' }).erro, 'id_invalido');
});

test('decisão de avaliação do Google só aceita id hexadecimal e status permitidos', () => {
  assert.equal(validarDecisao({ id: 'zz', status: 'publicada' }).erro, 'id_invalido');
  assert.equal(validarDecisao({ id: 'abc123', status: 'respondida_externa' }).erro, 'status_invalido');
  assert.equal(validarDecisao({ id: 'abc123', status: 'publicada', textoFinal: '' }).erro, 'texto_obrigatorio');
  const volta = validarDecisao({ id: 'abc123', status: 'novo', textoFinal: 'sobra' });
  assert.equal(volta.payload.textoFinal, '');
  const copiada = validarDecisao({ id: 'ABC123', status: 'aprovada', textoFinal: ' Olá! Obrigado. ' });
  assert.equal(copiada.payload.textoFinal, 'Olá! Obrigado.');
  assert.equal(validarSugestao({ id: '' }).erro, 'id_invalido');
  assert.equal(validarLote({ avaliacoes: [{ chave: 'g', nota: 5 }] }).erro, 'sem_avaliacoes');
  const lote = validarLote({ avaliacoes: [{ chave: 'ff01', nota: '4.6', texto: 'Ótimo', respondida: 'sim' }, { chave: 'ff02', nota: 9 }] });
  assert.equal(lote.payload.avaliacoes.length, 1);
  assert.equal(lote.payload.avaliacoes[0].nota, 5);
  assert.equal(lote.payload.avaliacoes[0].respondida, false);
});

test('ranking de bandas descarta linhas sem nome ou com número inválido', () => {
  assert.equal(validarRanking({ rows: [] }).erro, 'ranking_vazio');
  const ok = validarRanking({ rows: [
    { banda: 'Samba do Justa', aparicoesTotal: 4, diasComDadoReal: 3, faturamentoMedio: '12000', publicoMedio: 300, grupo: 'rock' },
    { banda: '', aparicoesTotal: 1, diasComDadoReal: 1, faturamentoMedio: 1, publicoMedio: 1 },
    { banda: 'DJ X', aparicoesTotal: 1, diasComDadoReal: 1, faturamentoMedio: 'abc', publicoMedio: 1 },
  ] });
  assert.equal(ok.payload.rows.length, 1);
  assert.equal(ok.payload.rows[0].grupo, 'banda');
  assert.equal(ok.payload.rows[0].faturamentoMedio, 12000);
});

test('snapshot da 99Food precisa ser um objeto não vazio e dentro do limite', () => {
  assert.equal(validarSnapshot99({}).erro, 'snapshot_invalido');
  assert.equal(validarSnapshot99({ snapshot: {} }).erro, 'snapshot_invalido');
  assert.equal(validarSnapshot99({ snapshot: [1] }).erro, 'snapshot_invalido');
  assert.equal(validarSnapshot99({ snapshot: { x: 'a'.repeat(46000) } }).erro, 'snapshot_invalido');
  assert.deepEqual(validarSnapshot99({ snapshot: { pedidosConcluidos: 2 } }).payload, { snapshot: { pedidosConcluidos: 2 } });
});

test('validações da Diretoria: fechar mês, decidir auditoria e dúvidas', () => {
  assert.equal(validarFechamentoMes({ area: 'cmv', monthKey: '2026-10' }).erro, 'area_invalida');
  assert.equal(validarFechamentoMes({ area: 'marketing', monthKey: '2026-10-01' }).payload.monthKey, '2026-10');
  assert.equal(validarFechamentoMes({ area: 'marketing', monthKey: 'out' }).erro, 'mes_invalido');
  assert.equal(validarDecisaoAuditoria({ id: '' }).erro, 'id_invalido');
  assert.deepEqual(validarDecisaoAuditoria({ id: 'it-1', observacao: ' ok ' }).payload, { id: 'it-1', observacao: 'ok' });
  assert.equal(validarRespostaDuvida({ id: 'd1', answer: '  ' }).erro, 'resposta_obrigatoria');
  assert.equal(validarNovaDuvida({ area: 'marketing', question: 'x' }).erro, 'area_invalida');
  assert.equal(validarNovaDuvida({ area: 'gestores', question: ' Como faço? ' }).payload.question, 'Como faço?');
});

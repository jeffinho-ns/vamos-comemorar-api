const test = require('node:test');
const assert = require('node:assert/strict');
const {
  compactColaboradores,
  compactCalor,
  fatorReserva,
} = require('../../services/biJustino/escalaDia');

test('o cadastro da escala guarda horário e esconde salário', () => {
  const lista = compactColaboradores({
    items: [
      {
        id: '1',
        nome: 'RODRIGO SATURNINO DA SILVA',
        cargo: 'salao',
        contratacao: 'CLT',
        ativo: true,
        salario: 4500,
        valorTotal: 6200,
        adSalarial: 300,
        horarioSemanal: [
          { trabalha: false },
          { trabalha: false },
          { trabalha: false },
          { trabalha: false },
          { trabalha: false },
          { trabalha: true, entrada: '16:30', saida: '23:30' },
          { trabalha: false },
        ],
      },
      { id: '2', nome: 'INATIVO', cargo: 'bar', contratacao: 'CLT', ativo: false, salario: 9999 },
      { id: '3', nome: 'FORA', cargo: 'outro', contratacao: 'CLT', ativo: true, salario: 1000 },
    ],
  });
  const texto = JSON.stringify(lista);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].nome, 'RODRIGO SATURNINO DA SILVA');
  assert.equal(lista[0].horarioSemanal[5].entrada, '16:30');
  assert.equal(texto.includes('4500'), false);
  assert.equal(texto.includes('salario'), false);
  assert.equal(texto.includes('9999'), false);
});

test('o calor da sexta é a média do formato de cada sexta já capturada', () => {
  const calor = compactCalor({
    items: [
      { date: '2026-10-16', start: '2026-10-16T21:00:00.000Z', value: 100 },
      { date: '2026-10-16', start: '2026-10-17T00:00:00.000Z', value: 300 },
      { date: '2026-10-23', start: '2026-10-23T21:00:00.000Z', value: 100 },
      { date: '2026-10-23', start: '2026-10-24T00:00:00.000Z', value: 100 },
    ],
  });
  const sexta = calor.porDia.find((dia) => dia.nome === 'Sexta');
  const as18 = sexta.blocos.find((bloco) => bloco.clock === '18:00');
  const as21 = sexta.blocos.find((bloco) => bloco.clock === '21:00');
  assert.equal(sexta.nDias, 2);
  assert.equal(as18.fracao, 0.375);
  assert.equal(as21.fracao, 0.625);
  assert.deepEqual(calor.datas, ['2026-10-16', '2026-10-23']);
});

test('o fator de reserva é a mediana do público real dividido pelo reservado', () => {
  const fator = fatorReserva(
    [
      { date: '2026-10-02', pax: 50 },
      { date: '2026-10-09', pax: 40 },
      { date: '2026-10-16', pax: 60 },
      { date: '2026-10-30', pax: 54 },
    ],
    [
      { date: '2026-10-02', publico: 55, receita: 1 },
      { date: '2026-10-09', publico: 40, receita: 1 },
      { date: '2026-10-16', publico: 72, receita: 1 },
    ],
    '2026-10-30',
  );
  const sexta = fator.find((dia) => dia.nome === 'Sexta');
  assert.equal(sexta.n, 3);
  assert.equal(sexta.fator, 1.1);
});

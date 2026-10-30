const test = require('node:test');
const assert = require('node:assert/strict');
const { montarEscala } = require('../../services/biJustino/escalaJustino');

test('a escala da semana usa o público do dia e o horário da casa', () => {
  const escala = montarEscala({
    hoje: '2026-10-30',
    porDiaSemana: [
      { nome: 'Sábado', publicoMedio: 200 },
      { nome: 'Segunda', publicoMedio: 0 },
    ],
    horario: {
      porDia: {
        Sábado: [
          { hora: '20:00', valor: 80 },
          { hora: '22:00', valor: 20 },
        ],
      },
    },
    semanas: [{ faturamento: 100000 }, { faturamento: 100000 }],
  });
  const segunda = escala.dias.find((dia) => dia.dia === 'Segunda');
  const sabado = escala.dias.find((dia) => dia.dia === 'Sábado');
  const garcom = sabado.setores.find((setor) => setor.chave === 'salao');
  assert.equal(segunda.fechado, true);
  assert.equal(sabado.pax, 200);
  assert.equal(sabado.presentesPico, 200);
  assert.ok(garcom.necessario >= 4);
  assert.equal(garcom.fixa, 4);
  assert.equal(escala.horario[0].dia, 'Segunda');
  assert.equal(escala.horario[0].fechado, true);
  assert.equal(escala.cmo.tetoPct, 8);
  assert.ok(escala.cmo.total >= 0);
});

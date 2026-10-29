const test = require('node:test');
const assert = require('node:assert/strict');
const { quadrosArea } = require('../../services/biJustino/quadrosArea');

test('os quadros de cada área usam DRE, último envio e CMV do robô', () => {
  const quadros = quadrosArea({
    faturamento: 308062.81,
    servico: 26751,
    dre: {
      valores: {
        rent: 53178.64,
        energy: 9301.42,
        water: 1907.32,
        gas: 4335.11,
        disposable: 4654.82,
        security: 6993.66,
        adminFixed: 47657.07,
        financeOther: 19239.26,
        card: 5760,
      },
    },
    marketing: { docs: [{ date: '2026-10-31', values: { mkTraffic: 0, mkAttractions: 4500, mkOther: 0, mkReservations: 0, mkShow: 0 } }] },
    rh: { docs: [{ date: '2026-09-28', values: { rhCore: 45841.92, rhExtras: 27826.25 } }] },
    operacao: { docs: [] },
    cmvZig: [{ cmvComida: 20.1, cmvBebida: 24.6, cobertura: 62.6, coberturaFood: 55.1, coberturaBev: 88.1, vendaComida: 100, vendaBebida: 100 }],
  });
  assert.equal(quadros.marketing.kpis.gasto, 4500);
  assert.ok(quadros.marketing.alertas.some((item) => item.titulo === 'ROAS atribuído'));
  assert.equal(Math.round(quadros.financeiro.kpis.utilidades), 15544);
  assert.ok(quadros.financeiro.alertas.some((item) => item.titulo === 'Administrativo fixo' && item.selo === 'CRÍTICO'));
  assert.ok(quadros.rh.kpis.cmo > 23);
  assert.equal(quadros.rh.alertas[1].selo, 'CRÍTICO');
  assert.equal(quadros.cmv.kpis.comida, 20.1);
  assert.equal(quadros.cmv.alertasComida[1].selo, 'SAUDÁVEL');
  assert.equal(JSON.stringify(quadros).includes('email'), false);
});

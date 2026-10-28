'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mesAlvo, extrairDre, mesesPresentes } = require('../../services/biJustino/dreLeitura');
const { faltando, loadDre, collectDre, formatoDreBase } = require('../../services/biJustino/dreSharepoint');

test('o mês da DRE é o anterior, no fuso de São Paulo', () => {
  const alvo = mesAlvo(new Date('2026-10-28T20:00:00.000Z'));
  assert.equal(alvo.label, 'Setembro/26');
  assert.equal(alvo.key, '2026-09');
});

test('soma as receitas e busca o mês anterior quando o campo está zerado', () => {
  const rotulos = [
    '',
    '(+) Faturamento',
    'Receita Alimentos',
    'Receita Bebidas',
    '(-) Deduções',
    'Total Impostos S/ Faturamento',
    'Energia Elétrica',
  ];
  const dre = extrairDre({
    mesLabel: 'Setembro/26',
    rotulos,
    fields: { revenue: '(+) Faturamento', tax: 'Total Impostos S/ Faturamento', energy: 'Energia Elétrica' },
    colunas: {
      'Setembro/26': [0, 0, 100, 40, 0, 0, 0],
      'Agosto/26': [0, 0, 80, 20, 0, 15, 900],
    },
  });
  assert.equal(dre.valores.revenue, 140);
  assert.equal(dre.valores.tax, 15);
  assert.equal(dre.fallbacks.tax, 'Agosto/26');
  assert.equal(dre.valores.energy, 900);
  assert.deepEqual(mesesPresentes('Setembro/26', ['', 'Agosto/26', 'Setembro/26']), ['Setembro/26', 'Agosto/26']);
});

test('sem as variáveis da Microsoft, não chama o SharePoint', async () => {
  let chamou = false;
  const dre = await loadDre(null, {}, {
    now: () => Date.parse('2026-10-28T20:00:00.000Z'),
    fetchImpl: async () => {
      chamou = true;
      return { ok: true, json: async () => ({}) };
    },
    store: {
      latestPayload: async () => null,
      saveSnapshot: async () => ({ captured_at: '2026-10-28T20:00:00.000Z' }),
    },
  });
  assert.equal(chamou, false);
  assert.equal(dre.disponivel, false);
  assert.equal(dre.motivo, 'credenciais_ausentes');
  assert.equal(faltando({}).includes('MS_CLIENT_SECRET'), true);
  assert.deepEqual(faltando({
    BI_MS_TENANT_ID: 't',
    BI_MS_CLIENT_ID: 'c',
    BI_MS_CLIENT_SECRET: 's',
    BI_MS_DRE_SHARE_URL: 'https://exemplo',
    BI_MS_DRE_CELL_MAP: '{}',
  }), []);
  assert.equal(JSON.stringify(dre).includes('segredo'), false);
});

test('a leitura da DRE devolve a cópia do banco sem abrir o SharePoint', async () => {
  let chamou = false;
  const env = {
    MS_TENANT_ID: 'tenant',
    MS_CLIENT_ID: 'client',
    MS_CLIENT_SECRET: 'segredo',
    MS_DRE_SHARE_URL: 'https://exemplo.sharepoint.com/dre',
    MS_DRE_CELL_MAP: '{}',
  };
  const dre = await loadDre(null, env, {
    fetchImpl: async () => {
      chamou = true;
      return { ok: true, json: async () => ({}) };
    },
    coletar: async () => {
      chamou = true;
      return {};
    },
    store: {
      latestPayload: async () => ({
        captured_at: '2026-09-01T12:00:00.000Z',
        payload: { mes: 'Agosto/26', valores: { rent: 10 } },
      }),
    },
  });
  assert.equal(chamou, false);
  assert.equal(dre.disponivel, true);
  assert.equal(dre.valores.rent, 10);
  assert.equal(JSON.stringify(dre).includes('segredo'), false);
});

test('o coletor grava a DRE nova e a leitura seguinte não busca de novo', async () => {
  let buscas = 0;
  let gravou = null;
  const env = {
    MS_TENANT_ID: 'tenant',
    MS_CLIENT_ID: 'client',
    MS_CLIENT_SECRET: 'segredo',
    MS_DRE_SHARE_URL: 'https://exemplo.sharepoint.com/dre',
    MS_DRE_CELL_MAP: '{}',
  };
  const copia = {
    captured_at: '2026-10-01T12:00:00.000Z',
    payload: { mes: 'Agosto/26', valores: { rent: 1 } },
  };
  const store = {
    latestPayload: async () => copia,
    saveSnapshot: async (_pool, body) => {
      gravou = body;
      copia.captured_at = '2026-10-28T20:00:00.000Z';
      copia.payload = body.payload;
      return { captured_at: copia.captured_at };
    },
  };
  const agora = Date.parse('2026-10-28T20:00:00.000Z');
  const gravado = await collectDre(null, env, {
    now: () => agora,
    freshMs: 1000,
    emit: false,
    store,
    coletar: async () => {
      buscas += 1;
      return { mes: 'Setembro/26', valores: { rent: 20 } };
    },
  });
  assert.equal(buscas, 1);
  assert.equal(gravou.source, 'dre_sharepoint');
  assert.equal(gravado.valores.rent, 20);
  const deNovo = await collectDre(null, env, {
    now: () => agora + 10,
    freshMs: 60 * 1000,
    emit: false,
    store,
    coletar: async () => {
      buscas += 1;
      return { mes: 'Outubro/26', valores: { rent: 99 } };
    },
  });
  assert.equal(buscas, 1);
  assert.equal(deNovo.valores.rent, 20);
  assert.equal(JSON.stringify(gravado).includes('segredo'), false);
});

test('sem a Microsoft no Render, a DRE entra pela planilha que o painel já gravou', async () => {
  let graph = false;
  const env = {
    BI_APPS_SCRIPT_EMAIL: 'robo@seujustino.local',
    BI_APPS_SCRIPT_PASSWORD: 'segredo',
  };
  const gravado = await collectDre(null, env, {
    now: () => Date.parse('2026-10-28T20:00:00.000Z'),
    freshMs: 1000,
    emit: false,
    coletar: async () => {
      graph = true;
      return {};
    },
    lerPainel: async () => formatoDreBase({
      values: { rent: '1.250,50', energy: 80 },
      mesPorCampo: { rent: 'Setembro/26', energy: 'Agosto/26' },
    }),
    store: {
      latestPayload: async () => null,
      saveSnapshot: async (_pool, body) => {
        assert.equal(body.source, 'dre_sharepoint');
        assert.equal(body.payload.valores.rent, 1250.5);
        assert.equal(body.payload.valores.energy, 80);
        assert.equal(body.payload.fallbacks.energy, 'Agosto/26');
        assert.equal(body.payload.fallbacks.rent, undefined);
        return { captured_at: '2026-10-28T20:00:00.000Z' };
      },
    },
  });
  assert.equal(graph, false);
  assert.equal(gravado.disponivel, true);
  assert.equal(gravado.mes, 'Setembro/26');
  assert.equal(JSON.stringify(gravado).includes('segredo'), false);
});

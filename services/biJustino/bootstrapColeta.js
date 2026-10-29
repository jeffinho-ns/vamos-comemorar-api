'use strict';

const { missingCredentialNames, readBootstrap } = require('./appsScriptClient');
const { formatoDreBase } = require('./dreSharepoint');
const { montar } = require('./painelNovidades');
const { painelDeMapa } = require('./zigPainel');
const { projecaoConsolidada } = require('./projecaoConsolidada');
const snapshotStore = require('./snapshotStore');
const { emitBiLiveChanged } = require('../../utils/biLiveRealtime');

const CHAMADAS = [
  { action: 'getDreBase' },
  { action: 'get99Food' },
  { action: 'getZigDelivery', payload: { days: 30 } },
  { action: 'getGoogleAvaliacoes' },
  { action: 'getCrmReservas' },
  { action: 'getCrmFunil' },
  { action: 'getCrmConfig' },
  { action: 'getInstagram' },
  { action: 'getZigBilheteria', payload: { limit: 13 } },
  { action: 'getCmvTeoricoParcial', payload: { limit: 8 } },
  { action: 'getZigItemSalesRanking', payload: { days: 30 } },
  { action: 'getZigHourly', payload: { days: 14 } },
  { action: 'getEventos' },
  { action: 'getFreelancerRequests' },
  { action: 'getEntries', payload: { area: 'financeiro', limit: 8 } },
  { action: 'getEntries', payload: { area: 'cmv', limit: 8 } },
  { action: 'getEntries', payload: { area: 'marketing', limit: 8 } },
  { action: 'getEntries', payload: { area: 'rh', limit: 8 } },
  { action: 'getEntries', payload: { area: 'operacao', limit: 8 } },
  { action: 'getZigRevenue', payload: { limit: 2000 } },
];

let emAndamento = null;

function porAcao(results) {
  const mapa = {};
  (results || []).forEach((item) => {
    if (!item || !item.r || item.r.ok === false) return;
    const area = item.payload && item.payload.area;
    mapa[area ? `${item.action}:${area}` : item.action] = item.r;
  });
  return mapa;
}

function temNovidade(lido) {
  return Boolean(
    lido.food
    || (lido.delivery && lido.delivery.length)
    || lido.avaliacoes
    || lido.instagram
    || (lido.crm && (lido.crm.funil || lido.crm.saude || (lido.crm.reservas && lido.crm.reservas.length)))
  );
}

function mesclarZig(anterior, painel) {
  const base = anterior && typeof anterior === 'object' ? anterior : {};
  return {
    ...base,
    serieMes: painel.serieMes && painel.serieMes.length ? painel.serieMes : (base.serieMes || []),
    serieAno: painel.serieAno && painel.serieAno.length ? painel.serieAno : (base.serieAno || []),
    custos: painel.custos && painel.custos.length ? painel.custos : (base.custos || []),
    horario: painel.horario || base.horario || null,
    bilheteria: painel.bilheteria && painel.bilheteria.length ? painel.bilheteria : (base.bilheteria || []),
    servicoMes: painel.mes && painel.mes.servico != null ? painel.mes.servico : (base.servicoMes ?? null),
    ranking: painel.ranking || base.ranking || null,
    cmvZig: painel.cmv && painel.cmv.length ? painel.cmv : (base.cmvZig || []),
    publicoMes: painel.mes && painel.mes.publico != null ? painel.mes.publico : (base.publicoMes ?? null),
    porDiaSemana: painel.porDiaSemana && painel.porDiaSemana.length ? painel.porDiaSemana : (base.porDiaSemana || []),
    semanas: painel.semanas && painel.semanas.length ? painel.semanas : (base.semanas || []),
    eventosResumo: painel.eventosResumo || base.eventosResumo || null,
    lancamentos: painel.lancamentos || base.lancamentos || null,
  };
}

async function coletarAbertura(pool, env, deps) {
  const options = deps || {};
  const sourceEnv = env || process.env;
  if (missingCredentialNames(sourceEnv).length) return null;
  if (emAndamento) return emAndamento;
  const store = options.store || snapshotStore;
  const ler = options.readBootstrap || readBootstrap;
  emAndamento = (async () => {
    const results = await ler(CHAMADAS, sourceEnv, options.fetchImpl, options.timeoutMs || 100000);
    const mapa = porAcao(results);
    const dre = formatoDreBase(mapa.getDreBase);
    if (dre) {
      await store.saveSnapshot(pool, { source: 'dre_sharepoint', action: 'getDreBase', payload: dre });
      if (options.emit !== false) emitBiLiveChanged('dre');
    }
    const novidades = montar([
      mapa.get99Food,
      mapa.getZigDelivery,
      mapa.getGoogleAvaliacoes,
      mapa.getCrmReservas,
      mapa.getCrmFunil,
      mapa.getCrmConfig,
      mapa.getInstagram,
    ]);
    if (temNovidade(novidades)) {
      await store.saveSnapshot(pool, { source: 'painel_novidades', action: 'novidades', payload: novidades });
      if (options.emit !== false) emitBiLiveChanged('novidades');
    }
    const last = await store.latestPayload(pool, 'faturamento_zig').catch(() => null);
    const anterior = last && last.payload ? last.payload : {};
    const painel = painelDeMapa(mapa);
    const projecao = projecaoConsolidada({
      faturamento: anterior.monthRevenue,
      financeiro: mapa['getEntries:financeiro'],
      marketing: mapa['getEntries:marketing'],
      rh: mapa['getEntries:rh'],
      operacao: mapa['getEntries:operacao'],
      cmv: mapa['getEntries:cmv'],
      freelancers: mapa.getFreelancerRequests && mapa.getFreelancerRequests.items,
    });
    if (painel || projecao) {
      const payload = painel ? mesclarZig(anterior, painel) : { ...anterior };
      payload.projecao = projecao;
      await store.saveSnapshot(pool, { source: 'faturamento_zig', action: 'getRevenueOverview', payload });
      if (options.emit !== false) emitBiLiveChanged('zig');
    }
    console.log('[bi-justino] abertura da planilha', {
      establishment: 'Seu Justino',
      dre: dre ? 'ok' : 'ausente',
      novidades: temNovidade(novidades) ? 'ok' : 'ausente',
      painel: painel ? 'ok' : 'ausente',
      projecao: projecao ? 'ok' : 'ausente',
    });
    return true;
  })().finally(() => { emAndamento = null; });

  try {
    return await emAndamento;
  } catch (err) {
    const codigo = err && err.code ? err.code : 'falha_na_coleta';
    console.error('[bi-justino] falha na abertura da planilha', { code: codigo });
    return null;
  }
}

module.exports = {
  coletarAbertura,
  porAcao,
  CHAMADAS,
};

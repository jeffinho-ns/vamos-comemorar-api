'use strict';

const SOURCE_ZIG = 'planilha:getZigRevenue';

function soNumero(valor, fallback = 0) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : fallback;
}

function arredondar(valor, casas = 2) {
  const fator = 10 ** casas;
  return Math.round(soNumero(valor) * fator) / fator;
}

function dataIso(valor) {
  const texto = String(valor || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : '';
}

function docsDe(bruto) {
  if (!bruto) return [];
  if (Array.isArray(bruto)) return bruto;
  if (typeof bruto !== 'object') return [];
  if (Array.isArray(bruto.docs)) return bruto.docs;
  if (Array.isArray(bruto.items)) return bruto.items;
  if (bruto.payload) return docsDe(bruto.payload);
  return [];
}

function noPeriodo(docs, inicio, fim) {
  const de = dataIso(inicio);
  const ate = dataIso(fim);
  return (docs || [])
    .map((doc) => {
      const date = dataIso(doc && doc.date);
      if (!date) return null;
      if (de && date < de) return null;
      if (ate && date > ate) return null;
      return {
        date,
        faturamento: soNumero(doc.revenue),
        publico: doc.publico === '' || doc.publico == null ? null : soNumero(doc.publico),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function ticketMedio(serie) {
  let receita = 0;
  let publico = 0;
  (serie || []).forEach((dia) => {
    if (dia.publico == null || dia.publico <= 0) return;
    receita += dia.faturamento;
    publico += dia.publico;
  });
  return publico > 0 ? arredondar(receita / publico) : null;
}

function estimativa(pessoas, ticket) {
  if (ticket == null) return null;
  return arredondar(soNumero(pessoas) * ticket);
}

function montarZigPeriodo(bruto) {
  const fonte = bruto || {};
  const serie = noPeriodo(fonte.docs, fonte.inicio, fonte.fim);
  const ticket = ticketMedio(serie);
  const pessoasCompareceram = soNumero(fonte.pessoasCompareceram);
  const pessoasWhatsapp = soNumero(fonte.pessoasWhatsapp);
  return {
    fonte: 'ZigPay',
    casa: 'Seu Justino',
    inicio: dataIso(fonte.inicio) || null,
    fim: dataIso(fonte.fim) || null,
    capturedAt: fonte.capturedAt || null,
    faturamento: arredondar(serie.reduce((acc, dia) => acc + dia.faturamento, 0)),
    publico: serie.reduce((acc, dia) => acc + (dia.publico || 0), 0),
    ticketMedio: ticket,
    pessoasCompareceram,
    pessoasWhatsapp,
    receitaEstimadaReservas: estimativa(pessoasCompareceram, ticket),
    receitaEstimadaWhatsapp: estimativa(pessoasWhatsapp, ticket),
    diasComFaturamento: serie.filter((dia) => dia.faturamento > 0).length,
    serie,
  };
}

function aplicarPessoas(zig, pessoasCompareceram, pessoasWhatsapp) {
  if (!zig) return null;
  const ticket = zig.ticketMedio;
  const pessoas = soNumero(pessoasCompareceram);
  const whatsapp = soNumero(pessoasWhatsapp);
  return {
    ...zig,
    pessoasCompareceram: pessoas,
    pessoasWhatsapp: whatsapp,
    receitaEstimadaReservas: estimativa(pessoas, ticket),
    receitaEstimadaWhatsapp: estimativa(whatsapp, ticket),
  };
}

async function carregarZigPeriodo(pool, options = {}, deps = {}) {
  const establishmentId = Number(options.establishmentId);
  if (!Number.isFinite(establishmentId) || establishmentId <= 0) return null;
  const resolveIds = deps.resolveJustinoPlaceIds
    || require('./biJustino/liveFacts').resolveJustinoPlaceIds;
  const store = deps.store || require('./biJustino/snapshotStore');
  let ids = [];
  try {
    ids = await resolveIds(pool);
  } catch (err) {
    console.warn('[whatsapp-zig] casas do Justino falharam', { message: err && err.message ? err.message : String(err) });
    return null;
  }
  if (!ids.map(Number).includes(establishmentId)) return null;
  let snap = null;
  try {
    snap = await store.latestPayload(pool, SOURCE_ZIG);
  } catch (err) {
    console.warn('[whatsapp-zig] snapshot falhou', { message: err && err.message ? err.message : String(err) });
    return null;
  }
  const docs = docsDe(snap && snap.payload);
  if (!docs.length) return null;
  return montarZigPeriodo({
    docs,
    inicio: options.inicio,
    fim: options.fim,
    pessoasCompareceram: options.pessoasCompareceram,
    pessoasWhatsapp: options.pessoasWhatsapp,
    capturedAt: snap.captured_at || null,
  });
}

module.exports = {
  SOURCE_ZIG,
  montarZigPeriodo,
  aplicarPessoas,
  carregarZigPeriodo,
};

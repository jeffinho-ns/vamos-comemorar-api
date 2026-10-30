'use strict';

const { texto, numero, enumDe } = require('./validacao');

const GRUPOS = ['voz', 'banda', 'dj'];

/**
 * Valida o corpo de saveBandRanking: { rows: [{ banda, aparicoesTotal, diasComDadoReal, faturamentoMedio, publicoMedio, grupo }] }.
 */
function validarRanking(entrada) {
  const lista = Array.isArray((entrada || {}).rows) ? entrada.rows.slice(0, 500) : [];
  const rows = lista
    .map((item) => {
      const fonte = item || {};
      const banda = texto(fonte.banda, 120);
      if (!banda) return null;
      const aparicoesTotal = numero(fonte.aparicoesTotal, { max: 100000 });
      const diasComDadoReal = numero(fonte.diasComDadoReal, { max: 100000 });
      const faturamentoMedio = numero(fonte.faturamentoMedio);
      const publicoMedio = numero(fonte.publicoMedio, { max: 1000000 });
      if ([aparicoesTotal, diasComDadoReal, faturamentoMedio, publicoMedio].some((v) => v == null)) return null;
      return {
        banda,
        aparicoesTotal,
        diasComDadoReal,
        faturamentoMedio,
        publicoMedio,
        grupo: enumDe(fonte.grupo, GRUPOS, 'banda'),
      };
    })
    .filter(Boolean);
  if (!rows.length) return { erro: 'ranking_vazio' };
  return { payload: { rows } };
}

module.exports = {
  GRUPOS,
  validarRanking,
};

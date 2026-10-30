'use strict';

const express = require('express');
const { canReadBiJustino } = require('../../services/biJustino/access');
const { gravarNaPlanilha } = require('../../services/biJustino/espelho/escrita');
const { encontrarLeitura } = require('../../services/biJustino/espelho/catalogo');
const { validarEnvio, validarApagar, validarFechamento } = require('../../services/biJustino/financeiro/envioMensal');
const { validarColaborador, validarApagarColaborador } = require('../../services/biJustino/rh/colaborador');
const { validarQuadroMinimo, validarDecisaoFreelancers } = require('../../services/biJustino/rh/quadroMinimo');
const { validarCmvTeoricoParcial, validarItensVendidos } = require('../../services/biJustino/cmv/robo');

const ESTAB = 'Seu Justino';

/** Chaves do espelho que cada área de envio afeta (o Financeiro também alimenta o faturamento do mês). */
const RECOLETA_ENVIO = {
  financeiro: ['getEntries:financeiro', 'getRevenueOverview'],
  rh: ['getEntries:rh'],
  cmv: ['getEntries:cmv'],
};

const AREAS_MES = ['financeiro', 'rh', 'cmv'];

/** Contrato das rotas POST desta área — usado nos testes unitários. */
const ROTAS_ESCRITA = [
  { caminho: '/justino/envio/financeiro', action: 'submitEntry', recoletar: RECOLETA_ENVIO.financeiro },
  { caminho: '/justino/envio/rh', action: 'submitEntry', recoletar: RECOLETA_ENVIO.rh },
  { caminho: '/justino/envio/cmv', action: 'submitEntry', recoletar: RECOLETA_ENVIO.cmv },
  { caminho: '/justino/financeiro/apagar', action: 'deleteEntry', recoletar: RECOLETA_ENVIO.financeiro },
  { caminho: '/justino/rh/apagar', action: 'deleteEntry', recoletar: RECOLETA_ENVIO.rh },
  { caminho: '/justino/cmv/apagar', action: 'deleteEntry', recoletar: RECOLETA_ENVIO.cmv },
  { caminho: '/justino/financeiro/mes', action: 'closeMonth', recoletar: ['getMonthClosures:financeiro'] },
  { caminho: '/justino/rh/mes', action: 'closeMonth', recoletar: ['getMonthClosures:rh'] },
  { caminho: '/justino/cmv/mes', action: 'closeMonth', recoletar: ['getMonthClosures:cmv'] },
  { caminho: '/justino/rh/freelancers/decidir', action: 'decideFreelancerRequestsBatch', recoletar: ['getFreelancerRequests', 'getEntries:rh'] },
  { caminho: '/justino/rh/quadro-minimo', action: 'saveSectorBase', recoletar: ['getSectorBase'] },
  { caminho: '/justino/rh/colaborador', action: 'saveEmployee', recoletar: ['getEmployees', 'getSectorBase'] },
  { caminho: '/justino/rh/colaborador/apagar', action: 'deleteEmployee', recoletar: ['getEmployees', 'getSectorBase'] },
  { caminho: '/justino/cmv/teorico-parcial', action: 'submitCmvTeoricoParcial', recoletar: ['getCmvTeoricoParcial'] },
  { caminho: '/justino/cmv/itens-vendidos', action: 'submitZigItemSales', recoletar: ['getZigItemSalesRanking'] },
];

function logErro(mensagem, extra) {
  console.error(`[bi-justino] ${mensagem}`, { establishment: ESTAB, ...(extra || {}) });
}

/**
 * Rotas de escrita do BI Seu Justino — Financeiro, RH e CMV.
 * Montadas em /api/bi (autenticação já vem do router pai). Toda escrita passa por gravarNaPlanilha
 * e recoleta as chaves do catálogo que a ação afeta.
 */
module.exports = (pool) => {
  const router = express.Router();

  async function autorizado(req, res) {
    const allowed = await canReadBiJustino(pool, req.user);
    if (!allowed) res.status(403).json({ ok: false, error: 'acesso_negado' });
    return allowed;
  }

  /** Executa a escrita validada e responde no envelope padrão. */
  async function escrever(res, contexto, entrada, extra) {
    const r = await gravarNaPlanilha(pool, process.env, entrada);
    if (!r.ok) {
      logErro(`${contexto}: planilha recusou`, { action: entrada.action, erro: r.erro });
      return res.status(502).json({ ok: false, error: r.erro });
    }
    return res.json({ ok: true, planilha: true, ...(extra || {}) });
  }

  function rota(caminho, contexto, handler) {
    router.post(caminho, async (req, res) => {
      try {
        if (!(await autorizado(req, res))) return undefined;
        return await handler(req, res);
      } catch (err) {
        logErro(`${contexto}: falha inesperada`, { message: err && err.message ? err.message : String(err) });
        return res.status(500).json({ ok: false, error: 'falha_ao_gravar' });
      }
    });
  }

  // ---- Envio mensal/diário por área (submitEntry) e exclusão (deleteEntry) ----
  for (const area of Object.keys(RECOLETA_ENVIO)) {
    rota(`/justino/envio/${area}`, `envio ${area}`, async (req, res) => {
      const v = validarEnvio(area, req.body);
      if (!v.ok) return res.status(400).json({ ok: false, error: v.error });
      return escrever(res, `envio ${area}`, { action: 'submitEntry', payload: v.payload, recoletar: RECOLETA_ENVIO[area] }, { date: v.payload.date });
    });

    rota(`/justino/${area}/apagar`, `apagar envio ${area}`, async (req, res) => {
      const v = validarApagar(area, req.body);
      if (!v.ok) return res.status(400).json({ ok: false, error: v.error });
      let apagados = 0;
      const falhas = [];
      for (const date of v.datas) {
        const ultima = date === v.datas[v.datas.length - 1];
        const r = await gravarNaPlanilha(pool, process.env, { action: 'deleteEntry', payload: { area, date }, recoletar: ultima ? RECOLETA_ENVIO[area] : [] });
        if (r.ok) apagados += 1;
        else falhas.push({ date, erro: r.erro });
      }
      if (!apagados) {
        logErro(`apagar envio ${area}: nenhuma data apagada`, { falhas });
        return res.status(502).json({ ok: false, error: falhas[0] ? falhas[0].erro : 'planilha_indisponivel', falhas });
      }
      return res.json({ ok: true, apagados, falhas });
    });
  }

  // ---- Fechar / reabrir mês (Financeiro, RH e CMV) ----
  for (const area of AREAS_MES) {
    rota(`/justino/${area}/mes`, `fechamento ${area}`, async (req, res) => {
      const v = validarFechamento(area, req.body);
      if (!v.ok) return res.status(400).json({ ok: false, error: v.error });
      const recoletar = [`getMonthClosures:${area}`];
      if (area === 'rh' && encontrarLeitura(`getEmployeesMonth:${v.payload.monthKey}`)) recoletar.push(`getEmployeesMonth:${v.payload.monthKey}`);
      return escrever(res, `fechamento ${area}`, { action: v.action, payload: v.payload, recoletar }, { monthKey: v.payload.monthKey, acao: v.action });
    });
  }

  // ---- RH: freelancers, quadro mínimo e colaboradores ----
  rota('/justino/rh/freelancers/decidir', 'decisão de freelancers', async (req, res) => {
    const v = validarDecisaoFreelancers(req.body);
    if (!v.ok) return res.status(400).json({ ok: false, error: v.error });
    return escrever(res, 'decisão de freelancers', {
      action: 'decideFreelancerRequestsBatch', payload: v.payload, recoletar: ['getFreelancerRequests', 'getEntries:rh'],
    }, { ids: v.payload.ids, approve: v.payload.approve });
  });

  rota('/justino/rh/quadro-minimo', 'quadro mínimo', async (req, res) => {
    const v = validarQuadroMinimo(req.body);
    if (!v.ok) return res.status(400).json({ ok: false, error: v.error });
    return escrever(res, 'quadro mínimo', { action: 'saveSectorBase', payload: v.payload, recoletar: ['getSectorBase'] });
  });

  rota('/justino/rh/colaborador', 'colaborador', async (req, res) => {
    const v = validarColaborador(req.body);
    if (!v.ok) return res.status(400).json({ ok: false, error: v.error });
    const recoletar = ['getEmployees', 'getSectorBase'];
    const mes = v.payload.mesReferencia;
    if (mes && encontrarLeitura(`getEmployeesMonth:${mes}`)) recoletar.push(`getEmployeesMonth:${mes}`);
    return escrever(res, 'colaborador', { action: 'saveEmployee', payload: v.payload, recoletar }, { nome: v.payload.nome });
  });

  rota('/justino/rh/colaborador/apagar', 'apagar colaborador', async (req, res) => {
    const v = validarApagarColaborador(req.body);
    if (!v.ok) return res.status(400).json({ ok: false, error: v.error });
    return escrever(res, 'apagar colaborador', { action: 'deleteEmployee', payload: v.payload, recoletar: ['getEmployees', 'getSectorBase'] });
  });

  // ---- CMV: entradas do robô (ZigPay × Everest) ----
  rota('/justino/cmv/teorico-parcial', 'cmv teórico parcial', async (req, res) => {
    const v = validarCmvTeoricoParcial(req.body);
    if (!v.ok) return res.status(400).json({ ok: false, error: v.error });
    return escrever(res, 'cmv teórico parcial', { action: 'submitCmvTeoricoParcial', payload: v.payload, recoletar: ['getCmvTeoricoParcial'] }, { date: v.payload.date });
  });

  rota('/justino/cmv/itens-vendidos', 'itens vendidos', async (req, res) => {
    const v = validarItensVendidos(req.body);
    if (!v.ok) return res.status(400).json({ ok: false, error: v.error });
    return escrever(res, 'itens vendidos', { action: 'submitZigItemSales', payload: v.payload, recoletar: ['getZigItemSalesRanking'] }, { date: v.payload.date, itens: v.payload.items.length });
  });

  return router;
};

module.exports.RECOLETA_ENVIO = RECOLETA_ENVIO;
module.exports.AREAS_MES = AREAS_MES;
module.exports.ROTAS_ESCRITA = ROTAS_ESCRITA;

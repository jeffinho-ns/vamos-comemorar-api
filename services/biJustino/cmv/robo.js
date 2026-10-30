'use strict';

/**
 * Entradas do robô de CMV (ZigPay × ficha técnica Everest) — ações `submitCmvTeoricoParcial` e
 * `submitZigItemSales` do Apps Script. Não há formulário manual na aba CMV do painel do Renato;
 * estes proxies existem para o robô/integrações gravarem pelo mesmo caminho e recoletarem o espelho.
 */

const { numeroBr } = require('../financeiro/envioMensal');

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const CAMPOS_PARCIAL = ['custoFoodTeorico', 'valorCobertoFood', 'valorTotalFood', 'custoBevTeorico', 'valorCobertoBev', 'valorTotalBev', 'valorTotalMisto', 'itensComFicha', 'itensSemFicha'];
const TIPOS_ITEM = ['comida', 'bebida', 'misto', 'outro', ''];
const LIMITE_ITENS = 3000;

function texto(valor, limite) {
  return String(valor == null ? '' : valor).replace(/\s+/g, ' ').trim().slice(0, limite);
}

function validarCmvTeoricoParcial(corpo) {
  const f = corpo && typeof corpo === 'object' ? corpo : {};
  const date = String(f.date || '').trim();
  if (!RE_DATA.test(date)) return { ok: false, error: 'data_invalida' };
  const payload = { date, source: texto(f.source, 60) || 'robo-zigpay' };
  for (const campo of CAMPOS_PARCIAL) {
    const n = f[campo] === undefined ? 0 : numeroBr(f[campo]);
    if (n === null || n < 0) return { ok: false, error: `valor_invalido:${campo}` };
    payload[campo] = n;
  }
  if (f.conferir === true) payload.conferir = true;
  return { ok: true, payload };
}

function validarItemVendido(item) {
  const it = item && typeof item === 'object' ? item : {};
  const nome = texto(it.nome, 160);
  const sku = texto(it.sku, 80);
  if (!nome && !sku) return null;
  const tipo = String(it.tipo || '');
  if (!TIPOS_ITEM.includes(tipo)) return null;
  const quantidade = it.quantidade === undefined ? 0 : numeroBr(it.quantidade);
  const valorTotal = it.valorTotal === undefined ? 0 : numeroBr(it.valorTotal);
  if (quantidade === null || valorTotal === null || quantidade < 0 || valorTotal < 0) return null;
  const saida = { sku, nome, categoria: texto(it.categoria, 80), tipo, quantidade, valorTotal };
  if (it.custoUnit !== undefined && it.custoUnit !== null && it.custoUnit !== '') {
    const custo = numeroBr(it.custoUnit);
    if (custo === null || custo < 0) return null;
    saida.custoUnit = custo;
  }
  return saida;
}

function validarItensVendidos(corpo) {
  const f = corpo && typeof corpo === 'object' ? corpo : {};
  const date = String(f.date || '').trim();
  if (!RE_DATA.test(date)) return { ok: false, error: 'data_invalida' };
  if (!Array.isArray(f.items)) return { ok: false, error: 'itens_ausentes' };
  if (f.items.length > LIMITE_ITENS) return { ok: false, error: 'itens_demais' };
  const items = [];
  for (let i = 0; i < f.items.length; i += 1) {
    const item = validarItemVendido(f.items[i]);
    if (!item) return { ok: false, error: `item_invalido:${i}` };
    items.push(item);
  }
  const payload = { date, items, source: texto(f.source, 60) || 'robo-zigpay' };
  if (f.conferir === true) payload.conferir = true;
  return { ok: true, payload };
}

module.exports = {
  CAMPOS_PARCIAL,
  validarCmvTeoricoParcial,
  validarItensVendidos,
};

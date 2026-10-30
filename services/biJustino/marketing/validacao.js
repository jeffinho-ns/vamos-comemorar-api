'use strict';

/**
 * Helpers de validação compartilhados pelos proxies de escrita do Marketing/Diretoria.
 * Tudo que chega do cliente passa por aqui antes de ir para a planilha.
 */

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_MES = /^\d{4}-\d{2}$/;
const RE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const RE_HEX = /^[0-9a-fA-F]{1,64}$/;

function texto(valor, limite) {
  const limpo = String(valor == null ? '' : valor).replace(/\r/g, '').trim();
  return limpo ? limpo.slice(0, limite) : '';
}

function dataIso(valor) {
  const d = String(valor || '').slice(0, 10);
  return RE_DATA.test(d) ? d : null;
}

function mesIso(valor) {
  const m = String(valor || '').slice(0, 7);
  return RE_MES.test(m) ? m : null;
}

function idSimples(valor) {
  const id = String(valor || '').trim();
  return RE_ID.test(id) ? id : null;
}

function idHex(valor) {
  const id = String(valor || '').replace(/[^0-9a-fA-F]/g, '');
  return RE_HEX.test(id) ? id : null;
}

function numero(valor, { min = 0, max = 1000000000 } = {}) {
  if (valor === '' || valor == null) return null;
  const n = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function enumDe(valor, lista, padrao) {
  const v = String(valor || '');
  return lista.includes(v) ? v : padrao;
}

module.exports = {
  texto,
  dataIso,
  mesIso,
  idSimples,
  idHex,
  numero,
  enumDe,
};

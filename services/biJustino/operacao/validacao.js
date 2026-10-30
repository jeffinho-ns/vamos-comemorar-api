'use strict';

/**
 * Helpers de validação compartilhados pelos proxies de escrita da área
 * Gerente Operador / Eventos / Reservas / Auditoria / Sistema do BI Seu Justino.
 * Tudo que chega do cliente passa por aqui antes de ir para a planilha.
 */

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_MES = /^\d{4}-\d{2}$/;
const RE_HORA = /^(\d{1,2}):(\d{2})/;
const RE_ID = /^[A-Za-z0-9_-]{1,80}$/;

function texto(valor, limite) {
  const limpo = String(valor == null ? '' : valor).replace(/\r/g, '').trim();
  return limpo.slice(0, limite || 500);
}

function textoLinhas(valor, limite) {
  const limpo = String(valor == null ? '' : valor).replace(/\r/g, '').trim();
  return limpo.slice(0, limite || 4000);
}

function dataIso(valor) {
  const d = String(valor || '').slice(0, 10);
  return RE_DATA.test(d) ? d : '';
}

function mesKey(valor) {
  const m = String(valor || '').slice(0, 7);
  return RE_MES.test(m) ? m : '';
}

function hora(valor) {
  const m = String(valor || '').trim().match(RE_HORA);
  if (!m) return '';
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return '';
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

function id(valor) {
  const v = String(valor || '').trim();
  return RE_ID.test(v) ? v : '';
}

function numeroBr(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  const bruto = String(valor == null ? '' : valor).trim();
  if (!bruto) return null;
  let normal = bruto;
  if (bruto.includes(',')) normal = bruto.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(bruto)) normal = bruto.replace(/\./g, '');
  const n = Number(normal.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function dinheiro(valor) {
  const n = numeroBr(valor);
  if (n == null) return 0;
  return Math.max(0, Math.min(1000000000, Math.round(n * 100) / 100));
}

function inteiro(valor, minimo, maximo) {
  const n = numeroBr(valor);
  if (n == null) return minimo;
  return Math.max(minimo, Math.min(maximo, Math.round(n)));
}

function booleano(valor) {
  if (valor === true || valor === 'true' || valor === 1 || valor === '1') return true;
  return false;
}

function enumOu(valor, lista, padrao) {
  const v = String(valor || '');
  return lista.includes(v) ? v : padrao;
}

function email(valor) {
  const v = texto(valor, 120).toLowerCase();
  if (!v) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

module.exports = {
  texto,
  textoLinhas,
  dataIso,
  mesKey,
  hora,
  id,
  numeroBr,
  dinheiro,
  inteiro,
  booleano,
  enumOu,
  email,
};

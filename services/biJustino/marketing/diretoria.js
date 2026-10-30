'use strict';

const { texto, mesIso, idSimples, enumDe } = require('./validacao');

// Mesma lista do Apps Script (MONTH_CLOSURE_AREAS).
const AREAS_FECHAMENTO = ['financeiro', 'rh', 'marketing', 'operacao', 'reservas', 'eventos', 'auditoriaop'];
const AREAS_DUVIDA = ['rh', 'gestores', 'diretoria'];

/** Valida closeMonth / reopenMonth: { area, monthKey }. */
function validarFechamentoMes(entrada) {
  const fonte = entrada || {};
  const area = enumDe(fonte.area, AREAS_FECHAMENTO, null);
  if (!area) return { erro: 'area_invalida' };
  const monthKey = mesIso(fonte.monthKey);
  if (!monthKey) return { erro: 'mes_invalido' };
  return { payload: { area, monthKey } };
}

/** Valida aprovarAuditoriaOpItem / negarAuditoriaOpItem: { id, observacao }. */
function validarDecisaoAuditoria(entrada) {
  const fonte = entrada || {};
  const id = idSimples(fonte.id);
  if (!id) return { erro: 'id_invalido' };
  return { payload: { id, observacao: texto(fonte.observacao, 1000) } };
}

/** Valida responderDuvida: { id, answer }. */
function validarRespostaDuvida(entrada) {
  const fonte = entrada || {};
  const id = idSimples(fonte.id);
  if (!id) return { erro: 'id_invalido' };
  const answer = texto(fonte.answer, 2000);
  if (!answer) return { erro: 'resposta_obrigatoria' };
  return { payload: { id, answer } };
}

/** Valida submitDuvida: { area, question }. */
function validarNovaDuvida(entrada) {
  const fonte = entrada || {};
  const area = enumDe(fonte.area, AREAS_DUVIDA, null);
  if (!area) return { erro: 'area_invalida' };
  const question = texto(fonte.question, 2000);
  if (!question) return { erro: 'pergunta_obrigatoria' };
  return { payload: { area, question } };
}

module.exports = {
  AREAS_FECHAMENTO,
  AREAS_DUVIDA,
  validarFechamentoMes,
  validarDecisaoAuditoria,
  validarRespostaDuvida,
  validarNovaDuvida,
};

'use strict';

const v = require('./validacao');

/** Áreas que a aba Gerente Operador e vizinhas podem fechar (subconjunto de MONTH_CLOSURE_AREAS do Code.gs). */
const AREAS_FECHAVEIS = ['operacao', 'reservas', 'eventos', 'auditoriaop'];
const AREAS_DUVIDA = ['rh', 'gestores', 'diretoria'];

function validarFecharMes(entrada) {
  const area = v.enumOu(entrada && entrada.area, AREAS_FECHAVEIS, '');
  if (!area) return { erro: 'area_invalida' };
  const monthKey = v.mesKey(entrada.monthKey);
  if (!monthKey) return { erro: 'mes_invalido' };
  return { payload: { area, monthKey } };
}

function validarDuvida(entrada) {
  const area = v.enumOu(entrada && entrada.area, AREAS_DUVIDA, '');
  if (!area) return { erro: 'area_invalida' };
  const question = v.textoLinhas(entrada.question, 2000);
  if (question.length < 3) return { erro: 'pergunta_obrigatoria' };
  return { payload: { area, question } };
}

function validarResposta(entrada) {
  const idDuvida = v.id(entrada && entrada.id);
  if (!idDuvida) return { erro: 'id_invalido' };
  const answer = v.textoLinhas(entrada.answer, 4000);
  if (!answer) return { erro: 'resposta_obrigatoria' };
  return { payload: { id: idDuvida, answer } };
}

function validarPresencaDiaria(entrada) {
  const fonte = entrada || {};
  const employeeId = v.id(fonte.employeeId);
  if (!employeeId) return { erro: 'funcionario_invalido' };
  const date = v.dataIso(fonte.date);
  if (!date) return { erro: 'data_invalida' };
  const payload = { employeeId, date };
  if (fonte.status !== undefined && fonte.status !== null && fonte.status !== '') {
    const status = v.enumOu(fonte.status, ['compareceu', 'faltou'], '');
    if (!status) return { erro: 'status_invalido' };
    payload.status = status;
  }
  if (fonte.observacao !== undefined) payload.observacao = v.texto(fonte.observacao, 500);
  if (payload.status === undefined && payload.observacao === undefined) return { erro: 'nada_para_gravar' };
  return { payload };
}

function validarZigPublico(entrada, agora) {
  const date = v.dataIso(entrada && entrada.date);
  if (!date) return { erro: 'data_invalida' };
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora || new Date());
  if (date > hoje) return { erro: 'data_futura' };
  const publico = v.numeroBr(entrada.publico);
  if (publico == null || publico < 0 || publico > 100000) return { erro: 'publico_invalido' };
  return { payload: { date, publico: Math.round(publico), source: 'bi-agilizai-publico' } };
}

module.exports = {
  AREAS_FECHAVEIS,
  AREAS_DUVIDA,
  validarFecharMes,
  validarDuvida,
  validarResposta,
  validarPresencaDiaria,
  validarZigPublico,
};

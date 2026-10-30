'use strict';

const v = require('./validacao');

/** Mesmas listas do Code.gs (RESERVATION_TIPOS / RESERVATION_ORIGENS). */
const TIPOS = ['normal', 'happyHour', 'despedida', 'aniversario'];
const ORIGENS = ['instagram', 'whatsapp', 'indicacao', 'google', 'porta', 'outro'];
const MAX_LOTE = 60;

function normalizarConvidados(bruto) {
  return String(bruto || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 500)
    .join('\n');
}

function reserva(fonte) {
  const date = v.dataIso(fonte && fonte.date);
  if (!date) return { erro: 'data_invalida' };
  const emailCliente = v.email(fonte.email);
  if (emailCliente === null) return { erro: 'email_invalido' };
  const origem = v.enumOu(fonte.origem, ORIGENS, '');
  return {
    item: {
      date,
      pax: v.inteiro(fonte.pax, 1, 2000),
      tipo: v.enumOu(fonte.tipo, TIPOS, 'normal'),
      nomeCliente: v.texto(fonte.nomeCliente, 120),
      telefone: v.texto(fonte.telefone, 40),
      email: emailCliente,
      observacao: v.textoLinhas(fonte.observacao, 2000),
      submittedByName: v.texto(fonte.submittedByName, 80),
      convidados: normalizarConvidados(fonte.convidados),
      origem,
      ativacaoId: origem === 'instagram' ? v.texto(fonte.ativacaoId, 80) : '',
      hora: v.hora(fonte.hora),
    },
  };
}

function validarNova(entrada) {
  const r = reserva(entrada || {});
  if (r.erro) return r;
  const clientRequestId = v.texto(entrada.clientRequestId, 80);
  return { payload: clientRequestId ? { ...r.item, clientRequestId } : r.item };
}

function validarEdicao(entrada) {
  const idReserva = v.id(entrada && entrada.id);
  if (!idReserva) return { erro: 'id_invalido' };
  const r = reserva(entrada);
  if (r.erro) return r;
  return { payload: { ...r.item, id: idReserva } };
}

function validarLote(entrada) {
  const itens = entrada && Array.isArray(entrada.items) ? entrada.items : [];
  if (!itens.length) return { erro: 'lote_vazio' };
  if (itens.length > MAX_LOTE) return { erro: 'lote_grande_demais' };
  const validos = [];
  for (const bruto of itens) {
    const r = reserva(bruto || {});
    if (r.erro) return { erro: r.erro };
    const clientRequestId = v.texto(bruto.clientRequestId, 80);
    validos.push(clientRequestId ? { ...r.item, clientRequestId } : r.item);
  }
  return { payload: { items: validos } };
}

function validarId(entrada) {
  const idReserva = v.id(entrada && entrada.id);
  if (!idReserva) return { erro: 'id_invalido' };
  return { payload: { id: idReserva } };
}

/** CRM do Dionísio: o painel só repassa o que o robô mandar; aqui garantimos forma e tamanho. */
function validarCrmReservas(entrada) {
  const rows = entrada && Array.isArray(entrada.rows) ? entrada.rows : [];
  if (!rows.length) return { erro: 'sem_linhas' };
  if (rows.length > 5000) return { erro: 'lote_grande_demais' };
  if (!rows.every((r) => r && typeof r === 'object' && v.id(r.id))) return { erro: 'linhas_invalidas' };
  return { payload: { rows } };
}

function validarCrmFunil(entrada) {
  const funil = entrada && entrada.funil;
  if (!funil || typeof funil !== 'object' || Array.isArray(funil)) return { erro: 'funil_invalido' };
  return { payload: { funil } };
}

function validarCrmConfig(entrada) {
  const config = entrada && entrada.config;
  if (!config || typeof config !== 'object' || Array.isArray(config)) return { erro: 'config_invalida' };
  if (Object.keys(config).length < 8) return { erro: 'config_vazia' };
  if (JSON.stringify(config).length > 45000) return { erro: 'grande_demais' };
  return { payload: { config } };
}

module.exports = {
  TIPOS,
  ORIGENS,
  normalizarConvidados,
  validarNova,
  validarEdicao,
  validarLote,
  validarId,
  validarCrmReservas,
  validarCrmFunil,
  validarCrmConfig,
};

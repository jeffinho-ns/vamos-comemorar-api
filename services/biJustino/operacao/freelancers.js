'use strict';

const v = require('./validacao');

/** Mesmas listas do Code.gs (FREELANCER_SECTORS / FREELANCER_REASONS / FREELANCER_PAY_TABLE). */
const SETORES = ['salao', 'cumim', 'bar', 'cozinha', 'limpeza', 'seguranca', 'caixa', 'runner', 'manutencao', 'estoquista'];
const MOTIVOS = ['demanda', 'folga', 'ferias', 'falta', 'compensacao', 'outro'];
const TURNOS = { 8: 125, 9: 135, 10: 145, 11: 155, 12: 165 };
const MAX_ITENS_LOTE = 120;

function itemPedido(fonte) {
  const date = v.dataIso(fonte && fonte.date);
  if (!date) return { erro: 'data_invalida' };
  const sector = v.enumOu(fonte.sector, SETORES, '');
  if (!sector) return { erro: 'setor_invalido' };
  const shiftHours = Number(fonte.shiftHours);
  if (!TURNOS[shiftHours]) return { erro: 'turno_invalido' };
  const qty = v.inteiro(fonte.qty, 0, 40);
  return {
    item: {
      date,
      sector,
      reason: v.enumOu(fonte.reason, MOTIVOS, 'demanda'),
      shiftHours,
      qty,
      note: v.texto(fonte.note, 500),
      freelancerNames: v.texto(fonte.freelancerNames, 200),
      horaEntrada: v.hora(fonte.horaEntrada),
      horaSaida: v.hora(fonte.horaSaida),
      horaPausa: v.hora(fonte.horaPausa),
    },
  };
}

function validarSolicitacao(entrada) {
  const r = itemPedido(entrada || {});
  if (r.erro) return r;
  if (r.item.qty < 1) return { erro: 'quantidade_invalida' };
  const { freelancerNames, horaEntrada, horaSaida, horaPausa, ...payload } = r.item;
  void freelancerNames; void horaEntrada; void horaSaida; void horaPausa;
  return { payload };
}

function validarLote(entrada) {
  const itens = entrada && Array.isArray(entrada.items) ? entrada.items : [];
  if (!itens.length) return { erro: 'lote_vazio' };
  if (itens.length > MAX_ITENS_LOTE) return { erro: 'lote_grande_demais' };
  const validos = [];
  for (const bruto of itens) {
    const r = itemPedido(bruto || {});
    if (r.erro) return { erro: r.erro };
    if (r.item.qty > 0) validos.push(r.item);
  }
  if (!validos.length) return { erro: 'lote_vazio' };
  return { payload: { items: validos } };
}

function validarDecisao(entrada) {
  const idPedido = v.id(entrada && entrada.id);
  if (!idPedido) return { erro: 'id_invalido' };
  return { payload: { id: idPedido, approve: v.booleano(entrada.approve), note: v.texto(entrada.note, 300) } };
}

function validarDecisaoLote(entrada) {
  const ids = entrada && Array.isArray(entrada.ids) ? entrada.ids.map(v.id).filter(Boolean) : [];
  if (!ids.length) return { erro: 'ids_invalidos' };
  if (ids.length > MAX_ITENS_LOTE) return { erro: 'lote_grande_demais' };
  return { payload: { ids, approve: v.booleano(entrada.approve), note: v.texto(entrada.note, 300) } };
}

function validarPresenca(entrada) {
  const idPedido = v.id(entrada && entrada.id);
  if (!idPedido) return { erro: 'id_invalido' };
  const payload = { id: idPedido };
  if (typeof entrada.attended === 'boolean') payload.attended = entrada.attended;
  if (entrada.note !== undefined) payload.note = v.texto(entrada.note, 500);
  if (payload.attended === undefined && payload.note === undefined) return { erro: 'nada_para_gravar' };
  return { payload };
}

function validarNomes(entrada) {
  const idPedido = v.id(entrada && entrada.id);
  if (!idPedido) return { erro: 'id_invalido' };
  const payload = { id: idPedido, names: v.texto(entrada.names, 200) };
  if (entrada.horaEntrada !== undefined) payload.horaEntrada = v.hora(entrada.horaEntrada);
  if (entrada.horaSaida !== undefined) payload.horaSaida = v.hora(entrada.horaSaida);
  if (entrada.horaPausa !== undefined) payload.horaPausa = v.hora(entrada.horaPausa);
  return { payload };
}

function validarId(entrada) {
  const idPedido = v.id(entrada && entrada.id);
  if (!idPedido) return { erro: 'id_invalido' };
  return { payload: { id: idPedido } };
}

module.exports = {
  SETORES,
  MOTIVOS,
  TURNOS,
  validarSolicitacao,
  validarLote,
  validarDecisao,
  validarDecisaoLote,
  validarPresenca,
  validarNomes,
  validarId,
};

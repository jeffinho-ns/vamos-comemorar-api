'use strict';

const v = require('../operacao/validacao');

/** Mesmas listas do Code.gs / HTML do painel. */
const TIPOS_EVENTO = ['aniversario', 'casamento', 'formatura', 'corporativo', 'confraternizacao', 'outro'];
const STATUS_EVENTO = ['orcamento', 'confirmado', 'realizado', 'cancelado'];
const TIPOS_INTERACAO = ['nota', 'ligacao', 'reuniao', 'email', 'whatsapp'];

/** Campos de acompanhamento comercial (EVENTO_FOLLOWUP_GROUPS do HTML). */
const FOLLOWUP_TEXTO = [
  'responsavel', 'agente', 'promotor', 'ambiente', 'origemLead', 'statusAdm', 'statusFormalizacao', 'statusDocInfo',
  'statusContrato', 'statusAgenda', 'statusPagamento', 'statusTemposMovimentos', 'statusOs', 'statusEmailCompras',
  'statusLista', 'statusZig', 'statusExcedentes', 'atracao', 'producao', 'statusNotaFiscal', 'feedback',
];
const FOLLOWUP_NUMERO = ['paxPresente', 'valorExcedente', 'valorProducao', 'valorTotal', 'comissaoCowMe', 'comissaoTimeComercial', 'comissaoPorAnalista'];
const FOLLOWUP_CAMPOS = [...FOLLOWUP_TEXTO, ...FOLLOWUP_NUMERO];

/** Campos da cotação (COTACAO_FIELD_GROUPS do HTML). */
const COTACAO_TEXTO = [
  'nomeEmpresaCliente', 'apelidoCliente', 'cnpjCliente', 'enderecoCliente', 'dataAberturaEmpresaCliente', 'nomeResponsavel',
  'telefoneCliente', 'nomeEvento', 'horaInicio', 'horaFim', 'duracaoExtenso', 'paxExtenso', 'ambiente', 'atracaoContratada',
  'menuDescricao', 'valorTotalExtenso', 'formaPagamento',
];

function validarEvento(entrada) {
  const fonte = entrada || {};
  const data = v.dataIso(fonte.data);
  if (!data) return { erro: 'data_invalida' };
  const nomeCliente = v.texto(fonte.nomeCliente, 160);
  if (!nomeCliente) return { erro: 'cliente_obrigatorio' };
  const idEvento = fonte.id ? v.id(fonte.id) : '';
  if (fonte.id && !idEvento) return { erro: 'id_invalido' };
  const emailCliente = v.email(fonte.email);
  if (emailCliente === null) return { erro: 'email_invalido' };
  const payload = {
    data,
    nomeCliente,
    documento: v.texto(fonte.documento, 40),
    telefone: v.texto(fonte.telefone, 40),
    email: emailCliente,
    tipoEvento: v.enumOu(fonte.tipoEvento, TIPOS_EVENTO, 'outro'),
    pax: v.inteiro(fonte.pax, 0, 10000),
    valorContrato: v.dinheiro(fonte.valorContrato),
    valorSinal: v.dinheiro(fonte.valorSinal),
    dataSinal: v.dataIso(fonte.dataSinal),
    status: v.enumOu(fonte.status, STATUS_EVENTO, 'orcamento'),
    pagamentoPendente: v.booleano(fonte.pagamentoPendente),
    observacao: v.textoLinhas(fonte.observacao, 4000),
  };
  // Follow-up: só manda o que veio (omitido preserva na planilha, igual ao Code.gs).
  FOLLOWUP_TEXTO.forEach((campo) => {
    if (fonte[campo] !== undefined) payload[campo] = v.texto(fonte[campo], 300);
  });
  FOLLOWUP_NUMERO.forEach((campo) => {
    if (fonte[campo] !== undefined) payload[campo] = v.dinheiro(fonte[campo]);
  });
  return { payload: idEvento ? { ...payload, id: idEvento } : payload };
}

function validarTarefa(entrada) {
  const fonte = entrada || {};
  const eventoId = v.id(fonte.eventoId);
  if (!eventoId) return { erro: 'evento_invalido' };
  const titulo = v.texto(fonte.titulo, 200);
  if (!titulo) return { erro: 'titulo_obrigatorio' };
  const dataVencimento = v.dataIso(fonte.dataVencimento);
  if (!dataVencimento) return { erro: 'data_invalida' };
  const responsavelEmail = v.email(fonte.responsavelEmail);
  if (responsavelEmail === null) return { erro: 'email_invalido' };
  const idTarefa = fonte.id ? v.id(fonte.id) : '';
  if (fonte.id && !idTarefa) return { erro: 'id_invalido' };
  const payload = { eventoId, titulo, dataVencimento, responsavelEmail };
  return { payload: idTarefa ? { ...payload, id: idTarefa } : payload };
}

function validarConcluirTarefa(entrada) {
  const idTarefa = v.id(entrada && entrada.id);
  if (!idTarefa) return { erro: 'id_invalido' };
  return { payload: { id: idTarefa, concluida: entrada.concluida !== false } };
}

function validarInteracao(entrada) {
  const fonte = entrada || {};
  const eventoId = v.id(fonte.eventoId);
  if (!eventoId) return { erro: 'evento_invalido' };
  const texto = v.textoLinhas(fonte.texto, 2000);
  if (!texto) return { erro: 'texto_obrigatorio' };
  return { payload: { eventoId, tipo: v.enumOu(fonte.tipo, TIPOS_INTERACAO, 'nota'), texto } };
}

function validarCotacao(entrada) {
  const fonte = entrada || {};
  const nomeEmpresaCliente = v.texto(fonte.nomeEmpresaCliente, 160);
  if (!nomeEmpresaCliente) return { erro: 'cliente_obrigatorio' };
  const dataEvento = v.dataIso(fonte.dataEvento);
  if (!dataEvento) return { erro: 'data_invalida' };
  const emailCliente = v.email(fonte.emailCliente);
  if (emailCliente === null) return { erro: 'email_invalido' };
  const idCotacao = fonte.id ? v.id(fonte.id) : '';
  if (fonte.id && !idCotacao) return { erro: 'id_invalido' };
  const payload = { nomeEmpresaCliente, dataEvento, emailCliente, pax: v.inteiro(fonte.pax, 0, 10000), valorTotal: v.dinheiro(fonte.valorTotal) };
  COTACAO_TEXTO.forEach((campo) => {
    if (campo === 'nomeEmpresaCliente') return;
    payload[campo] = v.texto(fonte[campo], 400);
  });
  return { payload: idCotacao ? { ...payload, id: idCotacao } : payload };
}

function validarDecisaoCotacao(entrada) {
  const idCotacao = v.id(entrada && entrada.id);
  if (!idCotacao) return { erro: 'id_invalido' };
  return { payload: { id: idCotacao, approve: v.booleano(entrada.approve), note: v.texto(entrada.note, 500) } };
}

function validarEnvioContrato(entrada) {
  const idCotacao = v.id(entrada && entrada.id);
  if (!idCotacao) return { erro: 'id_invalido' };
  const assunto = v.texto(entrada.assunto, 200);
  const corpo = v.textoLinhas(entrada.corpo, 4000);
  if (!assunto || !corpo) return { erro: 'mensagem_obrigatoria' };
  return { payload: { id: idCotacao, assunto, corpo } };
}

function validarId(entrada) {
  const idItem = v.id(entrada && entrada.id);
  if (!idItem) return { erro: 'id_invalido' };
  return { payload: { id: idItem } };
}

module.exports = {
  TIPOS_EVENTO,
  STATUS_EVENTO,
  TIPOS_INTERACAO,
  FOLLOWUP_CAMPOS,
  FOLLOWUP_NUMERO,
  COTACAO_TEXTO,
  validarEvento,
  validarTarefa,
  validarConcluirTarefa,
  validarInteracao,
  validarCotacao,
  validarDecisaoCotacao,
  validarEnvioContrato,
  validarId,
};

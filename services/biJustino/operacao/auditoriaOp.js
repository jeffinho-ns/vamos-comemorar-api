'use strict';

const v = require('./validacao');
const { SETORES } = require('./freelancers');

/** Mesmas listas do Code.gs (AUDITORIA_OP_*). */
const SETORES_AUDITORIA = [...SETORES, 'areaExterna'];
const TIPOS_SERVICO = ['manutencao', 'organizacao', 'obra', 'limpeza', 'aquisicao', 'outros'];
const PRIORIDADES = ['alta', 'media', 'baixa'];
const STATUS = ['aberto', 'andamento', 'aguardandoAprovacao', 'concluido', 'negado', 'aprovado'];

function validarItem(entrada) {
  const fonte = entrada || {};
  const descricaoProblema = v.textoLinhas(fonte.descricaoProblema, 2000);
  if (!descricaoProblema) return { erro: 'descricao_obrigatoria' };
  const idItem = fonte.id ? v.id(fonte.id) : '';
  if (fonte.id && !idItem) return { erro: 'id_invalido' };
  const necessitaAprovacao = v.booleano(fonte.necessitaAprovacao);
  const payload = {
    dataIdentificacao: v.dataIso(fonte.dataIdentificacao),
    setor: v.enumOu(fonte.setor, SETORES_AUDITORIA, 'manutencao'),
    tipoServico: v.enumOu(fonte.tipoServico, TIPOS_SERVICO, 'outros'),
    descricaoProblema,
    impactoOperacional: v.textoLinhas(fonte.impactoOperacional, 2000),
    responsavelInterno: v.texto(fonte.responsavelInterno, 120),
    empresaExecutora: v.texto(fonte.empresaExecutora, 120),
    necessitaAprovacao,
    valorEstimado: v.dinheiro(fonte.valorEstimado),
    prioridade: v.enumOu(fonte.prioridade, PRIORIDADES, 'media'),
    prazo: v.dataIso(fonte.prazo),
    dataInicio: v.dataIso(fonte.dataInicio),
    dataConclusao: v.dataIso(fonte.dataConclusao),
    status: v.enumOu(fonte.status, STATUS, 'aberto'),
    observacao: v.textoLinhas(fonte.observacao, 2000),
  };
  // Mesmo reforço do formulário do HTML: marcou "necessita aprovação" → nasce aguardando aprovação.
  if (!idItem && necessitaAprovacao) payload.status = 'aguardandoAprovacao';
  return { payload: idItem ? { ...payload, id: idItem } : payload };
}

function validarDecisao(entrada) {
  const idItem = v.id(entrada && entrada.id);
  if (!idItem) return { erro: 'id_invalido' };
  return { payload: { id: idItem, observacao: v.textoLinhas(entrada.observacao, 1000) } };
}

function validarId(entrada) {
  const idItem = v.id(entrada && entrada.id);
  if (!idItem) return { erro: 'id_invalido' };
  return { payload: { id: idItem } };
}

const MAX_BASE64 = 11 * 1024 * 1024;

function validarUpload(entrada) {
  const fonte = entrada || {};
  const itemId = v.id(fonte.itemId);
  if (!itemId) return { erro: 'id_invalido' };
  const fileBase64 = String(fonte.fileBase64 || '').replace(/\s/g, '');
  if (!fileBase64 || fileBase64.length < 16) return { erro: 'arquivo_obrigatorio' };
  if (fileBase64.length > MAX_BASE64) return { erro: 'arquivo_grande_demais' };
  return {
    payload: {
      itemId,
      fileBase64,
      fileName: v.texto(fonte.fileName, 180) || 'foto',
      mimeType: v.texto(fonte.mimeType, 80) || 'application/octet-stream',
      antesDepois: v.enumOu(fonte.antesDepois, ['antes', 'depois'], 'antes'),
      descricao: v.texto(fonte.descricao, 300),
    },
  };
}

/** Mesma conta de renderAuditoriaOpItens do HTML (KPIs sobre a lista inteira). */
function indicadores(itens, hoje) {
  const lista = Array.isArray(itens) ? itens : [];
  const atrasado = (it) => it.status !== 'concluido' && Boolean(it.prazo) && String(it.prazo) < hoje;
  return {
    aberto: lista.filter((x) => x.status === 'aberto').length,
    andamento: lista.filter((x) => x.status === 'andamento').length,
    aguardando: lista.filter((x) => x.status === 'aguardandoAprovacao').length,
    concluido: lista.filter((x) => x.status === 'concluido').length,
    atrasado: lista.filter(atrasado).length,
    valorAberto: lista.filter((x) => x.status !== 'concluido').reduce((s, x) => s + (Number(x.valorEstimado) || 0), 0),
    manutencaoAberta: lista.filter((x) => x.tipoServico === 'manutencao' && x.status !== 'concluido').reduce((s, x) => s + (Number(x.valorEstimado) || 0), 0),
  };
}

module.exports = {
  SETORES_AUDITORIA,
  TIPOS_SERVICO,
  PRIORIDADES,
  STATUS,
  validarItem,
  validarDecisao,
  validarId,
  validarUpload,
  indicadores,
};

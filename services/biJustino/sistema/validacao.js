'use strict';

const v = require('../operacao/validacao');

/** Mesmas listas do Code.gs (DOCUMENTACAO_TIPOS). */
const TIPOS_DOCUMENTO = ['alvara', 'licencaSanitaria', 'licencaBombeiros', 'seguro', 'contratoAluguel', 'outro'];
const DIAS_ALERTA_DOCUMENTO = 30;

function validarDocumentacao(entrada) {
  const fonte = entrada || {};
  const nome = v.texto(fonte.nome, 200);
  if (!nome) return { erro: 'nome_obrigatorio' };
  const idDoc = fonte.id ? v.id(fonte.id) : '';
  if (fonte.id && !idDoc) return { erro: 'id_invalido' };
  const payload = {
    tipo: v.enumOu(fonte.tipo, TIPOS_DOCUMENTO, 'outro'),
    tipoOutro: v.texto(fonte.tipoOutro, 120),
    nome,
    numero: v.texto(fonte.numero, 80),
    orgaoEmissor: v.texto(fonte.orgaoEmissor, 120),
    dataEmissao: v.dataIso(fonte.dataEmissao),
    dataValidade: v.dataIso(fonte.dataValidade),
    observacao: v.textoLinhas(fonte.observacao, 2000),
  };
  return { payload: idDoc ? { ...payload, id: idDoc } : payload };
}

function validarContato(entrada) {
  const fonte = entrada || {};
  const nome = v.texto(fonte.nome, 120);
  const telefone = v.texto(fonte.telefone, 40);
  if (!nome || !telefone) return { erro: 'nome_e_telefone_obrigatorios' };
  if (!/^[+\d][\d\s().-]{6,}$/.test(telefone)) return { erro: 'telefone_invalido' };
  const idContato = fonte.id ? v.id(fonte.id) : '';
  if (fonte.id && !idContato) return { erro: 'id_invalido' };
  const payload = {
    nome,
    categoria: v.texto(fonte.categoria, 120),
    telefone,
    observacao: v.textoLinhas(fonte.observacao, 1000),
    ativo: fonte.ativo !== false && fonte.ativo !== 'false' && fonte.ativo !== 0 && fonte.ativo !== '0',
  };
  return { payload: idContato ? { ...payload, id: idContato } : payload };
}

function validarDecisaoContato(entrada) {
  const idSolic = v.id(entrada && entrada.id);
  if (!idSolic) return { erro: 'id_invalido' };
  return { payload: { id: idSolic, approve: v.booleano(entrada.approve), nota: v.texto(entrada.nota, 300) } };
}

function validarId(entrada) {
  const idItem = v.id(entrada && entrada.id);
  if (!idItem) return { erro: 'id_invalido' };
  return { payload: { id: idItem } };
}

const MAX_BASE64 = 11 * 1024 * 1024;

function validarUploadArquivo(entrada) {
  const fonte = entrada || {};
  const idDoc = v.id(fonte.id);
  if (!idDoc) return { erro: 'id_invalido' };
  const fileBase64 = String(fonte.fileBase64 || '').replace(/\s/g, '');
  if (!fileBase64 || fileBase64.length < 16) return { erro: 'arquivo_obrigatorio' };
  if (fileBase64.length > MAX_BASE64) return { erro: 'arquivo_grande_demais' };
  return {
    payload: {
      id: idDoc,
      fileBase64,
      fileName: v.texto(fonte.fileName, 180) || 'arquivo',
      mimeType: v.texto(fonte.mimeType, 80) || 'application/octet-stream',
    },
  };
}

/** Mesma conta de diasParaVencer/situacaoDocumentoHtml do HTML. */
function diasParaVencer(dataValidade, hojeIso) {
  if (!dataValidade) return null;
  const [y1, m1, d1] = String(hojeIso).split('-').map(Number);
  const [y2, m2, d2] = String(dataValidade).split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function situacaoDocumento(dataValidade, hojeIso) {
  const dias = diasParaVencer(dataValidade, hojeIso);
  if (dias == null) return { nivel: 'mini', texto: 'sem vencimento', dias: null };
  if (dias < 0) return { nivel: 'r', texto: `venceu há ${Math.abs(dias)}d`, dias };
  if (dias <= DIAS_ALERTA_DOCUMENTO) return { nivel: 'y', texto: `vence em ${dias}d`, dias };
  return { nivel: 'g', texto: 'em dia', dias };
}

module.exports = {
  TIPOS_DOCUMENTO,
  DIAS_ALERTA_DOCUMENTO,
  validarDocumentacao,
  validarContato,
  validarDecisaoContato,
  validarId,
  validarUploadArquivo,
  diasParaVencer,
  situacaoDocumento,
};

'use strict';

const { texto, dataIso, idSimples, enumDe } = require('./validacao');

// Mesma lista do Apps Script (IG_ATIV_TIPOS).
const TIPOS_ATIVACAO = ['reel', 'story', 'carrossel', 'foto', 'promocao', 'evento', 'parceria', 'outro'];

/** Valida o corpo de saveIgAtivacao (Ativações do Instagram). */
function validarAtivacao(entrada) {
  const fonte = entrada || {};
  const data = dataIso(fonte.data);
  if (!data) return { erro: 'data_invalida' };
  const titulo = texto(fonte.titulo, 200);
  if (!titulo) return { erro: 'titulo_obrigatorio' };
  if (fonte.id != null && fonte.id !== '' && !idSimples(fonte.id)) return { erro: 'id_invalido' };
  const postId = fonte.postId ? String(fonte.postId).replace(/[^0-9A-Za-z_-]/g, '').slice(0, 64) : '';
  return {
    payload: {
      ...(fonte.id ? { id: String(fonte.id) } : {}),
      data,
      tipo: enumDe(fonte.tipo, TIPOS_ATIVACAO, 'outro'),
      titulo,
      oferta: texto(fonte.oferta, 200),
      postId,
      observacao: texto(fonte.observacao, 500),
    },
  };
}

function validarApagarAtivacao(entrada) {
  const id = idSimples((entrada || {}).id);
  if (!id) return { erro: 'id_invalido' };
  return { payload: { id } };
}

module.exports = {
  TIPOS_ATIVACAO,
  validarAtivacao,
  validarApagarAtivacao,
};

'use strict';

const { texto, idHex } = require('./validacao');

// Mesmos status do Apps Script (AVAL_STATUS); `respondida_externa` só o robô grava.
const STATUS_DECISAO = ['novo', 'aprovada', 'publicada', 'descartada'];

/** Valida o corpo de decidirGoogleAvaliacao. */
function validarDecisao(entrada) {
  const fonte = entrada || {};
  const id = idHex(fonte.id);
  if (!id) return { erro: 'id_invalido' };
  const status = String(fonte.status || '');
  if (!STATUS_DECISAO.includes(status)) return { erro: 'status_invalido' };
  const textoFinal = status === 'novo' || status === 'descartada' ? '' : texto(fonte.textoFinal, 1500);
  if (status === 'publicada' && !textoFinal) return { erro: 'texto_obrigatorio' };
  return { payload: { id, status, textoFinal } };
}

/** Valida o corpo de sugerirGoogleAvaliacao. */
function validarSugestao(entrada) {
  const id = idHex((entrada || {}).id);
  if (!id) return { erro: 'id_invalido' };
  return { payload: { id } };
}

/**
 * Valida o corpo de submitGoogleAvaliacoes (lista lida pelo robô; sem nome de cliente).
 * Cada item: { chave (hex), nota 1..5, texto, quando, respondida }.
 */
function validarLote(entrada) {
  const lista = Array.isArray((entrada || {}).avaliacoes) ? entrada.avaliacoes.slice(0, 200) : [];
  const avaliacoes = lista
    .map((item) => {
      const fonte = item || {};
      const chave = idHex(fonte.chave);
      const nota = Math.round(Number(fonte.nota));
      if (!chave || !(nota >= 1 && nota <= 5)) return null;
      return {
        chave,
        nota,
        texto: texto(fonte.texto, 1500),
        quando: texto(fonte.quando, 40),
        respondida: fonte.respondida === true,
      };
    })
    .filter(Boolean);
  if (!avaliacoes.length) return { erro: 'sem_avaliacoes' };
  return { payload: { avaliacoes } };
}

module.exports = {
  STATUS_DECISAO,
  validarDecisao,
  validarSugestao,
  validarLote,
};

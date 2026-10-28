'use strict';

function erroRecente(ms) {
  const janela = ms || 120000;
  let codigo = null;
  let em = 0;
  return {
    guardar(code) {
      codigo = code || 'falha_na_coleta';
      em = Date.now();
    },
    ler() {
      return codigo && Date.now() - em < janela ? codigo : null;
    },
    limpar() {
      codigo = null;
      em = 0;
    },
  };
}

module.exports = { erroRecente };

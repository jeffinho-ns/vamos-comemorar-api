'use strict';

const LIMITE_JSON = 45000;

/**
 * Valida o corpo de submit99Food: { snapshot: {...} } — leitura do painel da 99Food
 * feita pelo robô, sem dado de cliente. Aqui só garantimos que é um objeto razoável.
 */
function validarSnapshot99(entrada) {
  const snapshot = (entrada || {}).snapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return { erro: 'snapshot_invalido' };
  let serializado = '';
  try {
    serializado = JSON.stringify(snapshot);
  } catch (err) {
    return { erro: 'snapshot_invalido' };
  }
  if (serializado === '{}' || serializado.length > LIMITE_JSON) return { erro: 'snapshot_invalido' };
  return { payload: { snapshot } };
}

module.exports = {
  LIMITE_JSON,
  validarSnapshot99,
};

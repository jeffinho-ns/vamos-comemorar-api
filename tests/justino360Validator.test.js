'use strict';

const {
  assertJustinoEstablishment,
  validateRunItemStatus,
  validatePriority,
  parseBoolean,
  SEU_JUSTINO_ESTABLISHMENT_ID,
} = require('../validators/justino360Validator');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(SEU_JUSTINO_ESTABLISHMENT_ID === 1, 'Seu Justino id deve ser 1');
assert(assertJustinoEstablishment(1).ok === true, 'Justino permitido');
assert(assertJustinoEstablishment(7).ok === false, 'Highline bloqueado');
assert(validateRunItemStatus('ok') === 'ok', 'status ok');
assert(validateRunItemStatus('NAO_OK') === 'nao_ok', 'status nao_ok');
assert(validatePriority('critica') === 'critica', 'prioridade');
assert(validatePriority('xyz') === 'media', 'prioridade fallback');

// Tri-state: em NÃO OK, ocorrência e tarefa são o padrão do fluxo.
// Ausência do campo não pode ser lida como "não criar".
assert(parseBoolean(undefined, true) === true, 'undefined mantém default true');
assert(parseBoolean(null, true) === true, 'null mantém default true');
assert(parseBoolean('', true) === true, 'string vazia mantém default true');
assert(parseBoolean(false, true) === false, 'false explícito desliga');
assert(parseBoolean('false', true) === false, 'string false desliga');
assert(parseBoolean('0', true) === false, 'string 0 desliga');
assert(parseBoolean(true, false) === true, 'true explícito liga');
assert(parseBoolean('1', false) === true, 'string 1 liga');
assert(parseBoolean(undefined, false) === false, 'undefined mantém default false');

console.log('justino360Validator: ok');

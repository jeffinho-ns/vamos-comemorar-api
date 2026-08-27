'use strict';

/** Complementos enviados depois do preview da OS ("quer adicionar mais alguma coisa?"). */

const assert = require('assert');
const { parseOsAmendment } = require('../../services/staffAgent/artistOSTextParser');

// Campo que existe no modal vai para a coluna certa.
const briefing = parseOsAmendment('o briefing é chegada da banda às 16h');
assert.ok(briefing.fields.briefing, 'briefing preenchido');
assert.equal(briefing.extra_fields, null);

// Rótulo desconhecido vira campo extra.
const extra = parseOsAmendment('Open bar: até as 20h');
assert.deepEqual(extra.fields, {});
assert.equal(extra.extra_fields, 'Open bar: até as 20h');

// Vários de uma vez, misturando conhecido e extra.
const misto = parseOsAmendment('Benefícios: aniversariante não paga; Transporte: van do hotel');
assert.equal(misto.fields.benefits, 'aniversariante não paga');
assert.equal(misto.extra_fields, 'Transporte: van do hotel');

// Texto solto vira observação em vez de se perder.
const livre = parseOsAmendment('adiciona que a casa abre com DJ residente');
assert.ok(/Observações: /.test(livre.extra_fields), 'texto livre vira observação');

assert.equal(parseOsAmendment(''), null);

console.log('✅ staffAgentOsAmendment: complementos aplicados à OS');

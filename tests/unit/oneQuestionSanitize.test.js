const test = require('node:test');
const assert = require('node:assert/strict');
const {
  countQuestions,
  keepFirstQuestion,
  sanitizeToOneQuestion,
} = require('../../services/agent/oneQuestionSanitize');

test('countQuestions conta interrogações e ignora texto vazio', () => {
  assert.equal(countQuestions('Qual horário? E quantas pessoas? Qual área?'), 3);
  assert.equal(countQuestions('Qual horário?'), 1);
  assert.equal(countQuestions('Sem pergunta.'), 0);
  assert.equal(countQuestions(''), 0);
  assert.equal(countQuestions(null), 0);
  assert.equal(countQuestions(undefined), 0);
});

test('keepFirstQuestion recorta até a primeira interrogação', () => {
  assert.equal(
    keepFirstQuestion('Qual horário? E quantas pessoas? Qual área?'),
    'Qual horário?'
  );
  assert.equal(keepFirstQuestion('Sem pergunta.'), 'Sem pergunta.');
  assert.equal(keepFirstQuestion(''), '');
});

test('sanitizeToOneQuestion corta a segunda e a terceira interrogação', () => {
  assert.equal(
    sanitizeToOneQuestion('Qual horário? E quantas pessoas? Qual área?'),
    'Qual horário?'
  );
});

test('sanitizeToOneQuestion mantém uma pergunta só', () => {
  assert.equal(
    sanitizeToOneQuestion('  Qual horário fica melhor pra você?  '),
    'Qual horário fica melhor pra você?'
  );
  assert.equal(sanitizeToOneQuestion('Sem pergunta.'), 'Sem pergunta.');
  assert.equal(sanitizeToOneQuestion('   '), '');
  assert.equal(sanitizeToOneQuestion(null), '');
});

test('sanitizeToOneQuestion guarda no máximo uma frase antes da pergunta', () => {
  assert.equal(
    sanitizeToOneQuestion('Show. Beleza. Qual horário? E quantas pessoas? Qual área?'),
    'Beleza. Qual horário?'
  );
  assert.equal(
    sanitizeToOneQuestion('Perfeito, anotei. Qual horário? E quantas pessoas?'),
    'Perfeito, anotei. Qual horário?'
  );
});

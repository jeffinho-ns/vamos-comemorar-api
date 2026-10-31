const test = require('node:test');
const assert = require('node:assert/strict');
const { humanizeCreateError } = require('../../services/agent/reservationCreateError');

const identityReadyState = {
  establishment_id: 1,
  reservation_date: '2026-10-30',
  reservation_time: '21:00',
  quantidade_convidados: 6,
  client_name: 'Ana Silva',
  client_email: 'ana@example.com',
};

function assertSingleUnlockQuestion(replyText) {
  const text = String(replyText || '');
  assert.ok(text.trim(), 'replyText vazio');
  assert.doesNotMatch(text, /me diz (s[oó] )?o que (ainda )?falta/i);
  assert.doesNotMatch(text, /^\s*[-*•]/m);
  assert.doesNotMatch(text, /\n\s*[-*•]/);
}

test('duplicata avisa que a reserva já está no sistema', () => {
  const { replyText } = humanizeCreateError({ ok: false, duplicate: true }, identityReadyState);
  assert.equal(
    replyText,
    'Essa reserva já está no sistema. Quer que eu chame a equipe se precisar ajustar?'
  );
  assertSingleUnlockQuestion(replyText);
});

test('mesa ou área ocupada pede outro horário', () => {
  const { replyText } = humanizeCreateError(
    {
      ok: false,
      error: 'A área coberta está cheia para essa data (mesmo combinando mesas).',
    },
    identityReadyState
  );
  assert.equal(replyText, 'Esse horário nessa área acabou de lotar. Prefere outro horário?');
  assertSingleUnlockQuestion(replyText);
});

test('todas as áreas cheias também pede outro horário', () => {
  const { replyText } = humanizeCreateError(
    { ok: false, todas_areas_cheias: true, error: 'Todas as áreas estão sem mesa livre.' },
    identityReadyState
  );
  assert.equal(replyText, 'Esse horário nessa área acabou de lotar. Prefere outro horário?');
});

test('validação de nascimento faz só a pergunta do campo', () => {
  const { replyText } = humanizeCreateError(
    { ok: false, error: 'Reservas exigem +18 anos.' },
    identityReadyState
  );
  assert.match(replyText, /nascimento|nasceu/i);
  assert.doesNotMatch(replyText, /e-mail|nome completo|o que falta/i);
  assertSingleUnlockQuestion(replyText);
});

test('validação de área faz só a pergunta do campo', () => {
  const { replyText } = humanizeCreateError(
    {
      ok: false,
      error:
        'Pergunte se o cliente prefere área coberta ou área descoberta. Depois crie a reserva com area="coberta" ou area="descoberta".',
    },
    identityReadyState
  );
  assert.match(replyText, /[aá]rea|coberta|descoberta/i);
  assert.doesNotMatch(replyText, /nascimento|e-mail|o que falta/i);
  assertSingleUnlockQuestion(replyText);
});

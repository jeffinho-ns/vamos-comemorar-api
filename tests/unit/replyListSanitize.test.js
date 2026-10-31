const test = require('node:test');
const assert = require('node:assert/strict');
const {
  looksLikeListOrGrid,
  rewriteListToProse,
  sanitizeListOrGridReply,
} = require('../../services/agent/replyListSanitize');

function sentenceCount(text) {
  return String(text)
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function assertNoListSyntax(text) {
  assert.doesNotMatch(text, /^\s*[-*]/m);
  assert.doesNotMatch(text, /^\s*\d+[.)]\s/m);
  assert.doesNotMatch(text, /\*\*/);
  assert.doesNotMatch(text, /```/);
  assert.doesNotMatch(text, /^\s*#{1,6}\s/m);
  assert.doesNotMatch(text, /\|/);
  assert.doesNotMatch(text, /\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}/);
  assert.doesNotMatch(text, /\bcaro\b/i);
  assert.doesNotMatch(text, /atenciosamente/i);
  assert.ok(sentenceCount(text) <= 2);
  assert.ok((text.match(/\?/g) || []).length <= 1);
}

test('bullets de horário viram prosa sem traço', () => {
  const input = '- 17h\n- 18h\n- 19h';
  assert.equal(looksLikeListOrGrid(input), true);

  const out = sanitizeListOrGridReply(input);

  assertNoListSyntax(out);
  assert.doesNotMatch(out, /17h/);
  assert.doesNotMatch(out, /18h/);
  assert.doesNotMatch(out, /19h/);
  assert.match(out, /você/);
  assert.match(out, /horário/i);
});

test('markdown e lista numerada somem', () => {
  const input = '**Horários:**\n1. 17h';
  assert.equal(looksLikeListOrGrid(input), true);

  const out = sanitizeListOrGridReply(input);

  assertNoListSyntax(out);
  assert.doesNotMatch(out, /Horários:/);
  assert.match(out, /você/);
});

test('grade HH:MM-HH:MM não volta como lista', () => {
  const input = '14:00-23:30\n17:00 - 18:00\n18:00 - 19:00';
  assert.equal(looksLikeListOrGrid(input), true);
  assert.equal(looksLikeListOrGrid('17:00 - 18:00'), true);

  const out = sanitizeListOrGridReply(input);

  assertNoListSyntax(out);
  assert.doesNotMatch(out, /14/);
  assert.doesNotMatch(out, /17/);
  assert.doesNotMatch(out, /18/);
  assert.doesNotMatch(out, /23/);
  assert.match(out, /você/);
});

test('horário já dito no workingState confirma 21h e não lista janelas', () => {
  const input = 'Janelas:\n- 17h\n- 18h\n- 19h\n- 20h\n14:00-23:30';
  const workingState = { reservation_time: '21:00', reservation_date: '2026-11-07' };
  const out = sanitizeListOrGridReply(input, { workingState });

  assertNoListSyntax(out);
  assert.match(out, /21h/);
  assert.doesNotMatch(out, /17h/);
  assert.doesNotMatch(out, /18h/);
  assert.doesNotMatch(out, /19h/);
  assert.doesNotMatch(out, /20h/);
  assert.doesNotMatch(out, /14:00/);
  assert.doesNotMatch(out, /23:30/);
  assert.match(out, /pessoas/i);
  assert.equal(workingState.reservation_time, '21:00');
});

test('prosa limpa permanece igual, só com trim', () => {
  const prose = 'Qual horário fica melhor pra você?';
  assert.equal(looksLikeListOrGrid(prose), false);
  assert.equal(sanitizeListOrGridReply(`  ${prose}  `), prose);
  assert.equal(
    sanitizeListOrGridReply(prose, { workingState: { reservation_time: '21:00' } }),
    prose
  );
  assert.equal(rewriteListToProse(prose), prose);
});

test('saída sanitizada não tem marcador de lista', () => {
  const samples = [
    '- 17h\n- 18h\n- 19h',
    '* 17h\n* 18h',
    '• 19h\n• 20h',
    '1. 17h\n2. 18h\n3. 19h',
    '1) 17h\n2) 18h',
    '**Horários:**\n1. 17h',
    '# Horários\n17:00\n18:00\n19:00',
    '```\n17h\n18h\n19h\n```',
    '| 17:00 | Deck |\n| 18:00 | Bar |',
    '14:00-23:30\n17:00 - 18:00',
    '17h, 18h, 19h, 20h',
  ];

  for (const sample of samples) {
    assert.equal(looksLikeListOrGrid(sample), true, sample);
    assertNoListSyntax(sanitizeListOrGridReply(sample));
    assertNoListSyntax(
      sanitizeListOrGridReply(sample, {
        workingState: { reservation_time: '21:00' },
        alreadySaidTime: '21:00',
      })
    );
  }
});

test('vazio e null viram string vazia', () => {
  assert.equal(sanitizeListOrGridReply(null), '');
  assert.equal(sanitizeListOrGridReply(undefined), '');
  assert.equal(sanitizeListOrGridReply(''), '');
  assert.equal(sanitizeListOrGridReply('   '), '');
  assert.equal(sanitizeListOrGridReply(0), '');
  assert.equal(rewriteListToProse(null), '');
  assert.equal(looksLikeListOrGrid(null), false);
  assert.equal(looksLikeListOrGrid(''), false);
});

test('alreadySaidTime confirma o horário explícito e ignora a grade', () => {
  const out = rewriteListToProse('14:00-23:30 e também 17h, 18h, 19h', {
    alreadySaidTime: '21:30',
    workingState: { reservation_time: '18:00', reservation_date: '2026-11-07' },
  });

  assert.match(out, /21h30/);
  assert.doesNotMatch(out, /18h/);
  assert.doesNotMatch(out, /14/);
  assert.doesNotMatch(out, /17h/);
  assertNoListSyntax(out);
});

test('não inventa casa, área ou vaga que o texto não tem', () => {
  const out = sanitizeListOrGridReply('- 17h\n- 18h\n- 19h');
  assert.doesNotMatch(out, /highline|justino|pracinha|deck|rooftop|camarote|vaga/i);
});

test('um único bullet vira uma frase', () => {
  const out = sanitizeListOrGridReply('- sem chinelo');
  assert.match(out, /^Sem chinelo\.$/);
  assertNoListSyntax(out);
  assert.equal(sentenceCount(out), 1);
});

test('bullets que não são horário preservam as palavras originais', () => {
  const out = sanitizeListOrGridReply("- sem chinelo\n- sem bermuda rasgada");
  assert.match(out, /chinelo/);
  assert.match(out, /bermuda/);
  assert.doesNotMatch(out, /highline|vaga/i);
  assertNoListSyntax(out);
  assert.equal(sentenceCount(out), 1);
});

test('uma janela única vira prosa sem notação de grade', () => {
  const out = sanitizeListOrGridReply('Funcionamento 14:00-23:30');
  assert.match(out, /14h/);
  assert.match(out, /23h30/);
  assertNoListSyntax(out);
  assert.equal(sentenceCount(out), 1);
});

test('com horário escolhido a janela única não é despejada', () => {
  const out = sanitizeListOrGridReply('14:00-23:30', {
    workingState: {
      reservation_time: '21:00',
      reservation_date: '2026-11-07',
      quantidade_convidados: 4,
    },
  });
  assert.match(out, /21h/);
  assert.doesNotMatch(out, /14h/);
  assert.doesNotMatch(out, /23h30/);
  assert.match(out, /nome/i);
  assertNoListSyntax(out);
});

test('pergunta o próximo dado que ainda falta', () => {
  const grid = '- 17h\n- 18h\n- 19h';
  const base = { reservation_time: '21:00' };

  const semData = sanitizeListOrGridReply(grid, { workingState: { ...base } });
  assert.match(semData, /quando|dia/i);

  const semPessoas = sanitizeListOrGridReply(grid, {
    workingState: { ...base, reservation_date: '2026-11-07' },
  });
  assert.match(semPessoas, /pessoas/i);

  const semNome = sanitizeListOrGridReply(grid, {
    workingState: { ...base, reservation_date: '2026-11-07', quantidade_convidados: 6 },
  });
  assert.match(semNome, /nome/i);

  const semEmail = sanitizeListOrGridReply(grid, {
    workingState: {
      ...base,
      reservation_date: '2026-11-07',
      quantidade_convidados: 6,
      client_name: 'Ana Lima',
    },
  });
  assert.match(semEmail, /e-mail/i);

  const semNascimento = sanitizeListOrGridReply(grid, {
    workingState: {
      ...base,
      reservation_date: '2026-11-07',
      quantidade_convidados: 6,
      client_name: 'Ana Lima',
      client_email: 'ana@email.com',
    },
  });
  assert.match(semNascimento, /nascimento/i);

  const completo = sanitizeListOrGridReply(grid, {
    workingState: {
      ...base,
      reservation_date: '2026-11-07',
      quantidade_convidados: 6,
      client_name: 'Ana Lima',
      client_email: 'ana@email.com',
      data_nascimento: '1990-01-01',
    },
  });
  assert.match(completo, /sua reserva/i);
  assert.match(completo, /21h/);
});

test('horário solto em prosa não é tratado como grade', () => {
  const prose = 'Pode ser às 21:00?';
  assert.equal(looksLikeListOrGrid(prose), false);
  assert.equal(sanitizeListOrGridReply(prose), prose);
});

test('caracteres especiais e apóstrofo continuam na prosa', () => {
  const weird = "Qual horário fica melhor pra você?'; DROP TABLE reservas;--";
  assert.equal(sanitizeListOrGridReply(weird), weird);

  const out = sanitizeListOrGridReply("- aniversário d'O'Brien\n- reunião");
  assert.match(out, /aniversário/i);
  assert.match(out, /O'Brien/);
  assert.match(out, /reunião/i);
  assertNoListSyntax(out);
});

test('várias linhas só com horário contam como grade', () => {
  const input = '17:00\n18:00\n19:00';
  assert.equal(looksLikeListOrGrid(input), true);
  const out = sanitizeListOrGridReply(input);
  assertNoListSyntax(out);
  assert.doesNotMatch(out, /17:00/);
  assert.doesNotMatch(out, /18:00/);
});

test('contexto null não quebra texto sem lista', () => {
  assert.equal(sanitizeListOrGridReply('  oi  ', null), 'oi');
  assert.equal(rewriteListToProse('  oi  ', null), 'oi');
});

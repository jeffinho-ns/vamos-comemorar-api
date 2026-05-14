function parseIsoDate(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return { year, month, day, iso: raw };
}

function getTodayPartsSaoPaulo() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const result = { year: 0, month: 0, day: 0 };
  for (const part of parts) {
    if (part.type === 'year') result.year = Number(part.value);
    if (part.type === 'month') result.month = Number(part.value);
    if (part.type === 'day') result.day = Number(part.value);
  }
  return result;
}

function compareYmd(left, right) {
  if (left.year !== right.year) return left.year < right.year ? -1 : 1;
  if (left.month !== right.month) return left.month < right.month ? -1 : 1;
  if (left.day !== right.day) return left.day < right.day ? -1 : 1;
  return 0;
}

function calculateAgeFromIsoDate(isoDate) {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return null;

  const today = getTodayPartsSaoPaulo();
  let age = today.year - parsed.year;
  if (today.month < parsed.month || (today.month === parsed.month && today.day < parsed.day)) {
    age -= 1;
  }
  return age;
}

function validateBirthDate(value, options = {}) {
  const minAge = Number(options.minAge) > 0 ? Number(options.minAge) : 18;
  const parsed = parseIsoDate(value);
  if (!parsed) {
    return {
      ok: false,
      code: 'BIRTHDATE_INVALID',
      message: 'Preciso da data de nascimento no formato DD-MM-AAAA ou AAAA-MM-DD para confirmar a maioridade.',
    };
  }

  const age = calculateAgeFromIsoDate(parsed.iso);
  if (age === null) {
    return {
      ok: false,
      code: 'BIRTHDATE_INVALID',
      message: 'Não consegui interpretar a data de nascimento. Pode me enviar novamente?',
    };
  }

  if (age < minAge) {
    return {
      ok: false,
      code: 'UNDERAGE',
      message:
        'Para reservar conosco é necessário ter 18 anos ou mais. Se for menor, um responsável pode seguir por aqui.',
    };
  }

  if (age > 120) {
    return {
      ok: false,
      code: 'BIRTHDATE_IMPLAUSIBLE',
      message: 'A data de nascimento informada parece incorreta. Pode conferir e me enviar de novo?',
    };
  }

  return { ok: true, normalized: parsed.iso, age };
}

module.exports = {
  parseIsoDate,
  getTodayPartsSaoPaulo,
  compareYmd,
  calculateAgeFromIsoDate,
  validateBirthDate,
};

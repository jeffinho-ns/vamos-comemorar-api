function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validateEmail(value) {
  const email = normalizeEmail(value);
  if (!email) {
    return { ok: false, code: 'EMAIL_REQUIRED', message: 'Preciso de um e-mail válido para seguir com a reserva.' };
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailPattern.test(email)) {
    return {
      ok: false,
      code: 'EMAIL_INVALID',
      message: 'Esse e-mail não parece válido. Pode me enviar novamente no formato nome@provedor.com?',
    };
  }

  return { ok: true, normalized: email };
}

module.exports = {
  normalizeEmail,
  validateEmail,
};

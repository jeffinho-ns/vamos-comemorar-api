const businessRulesEngine = require('../services/businessRulesEngine');
const { parseIsoDate, getTodayPartsSaoPaulo, compareYmd } = require('./ageValidator');

function validateReservationDate(value, context = {}) {
  const parsed = parseIsoDate(value);
  if (!parsed) {
    return {
      ok: false,
      code: 'DATE_INVALID',
      message: 'Qual data você prefere? Pode me enviar no formato DD/MM ou AAAA-MM-DD.',
    };
  }

  const today = getTodayPartsSaoPaulo();
  if (compareYmd(parsed, today) < 0) {
    return {
      ok: false,
      code: 'DATE_IN_PAST',
      message: 'A data precisa ser hoje ou uma data futura. Pode me enviar outra data?',
    };
  }

  const establishmentId = Number(context.establishmentId);
  const pool = context.pool;
  if (Number.isFinite(establishmentId) && establishmentId > 0 && pool) {
    return businessRulesEngine
      .getDateOverride(pool, establishmentId, parsed.iso)
      .then((override) => {
        if (override && override.is_open === false) {
          return {
            ok: false,
            code: 'DATE_CLOSED',
            message: 'Nessa data a casa está fechada para reservas. Quer tentar outro dia?',
          };
        }
        return { ok: true, normalized: parsed.iso };
      });
  }

  return Promise.resolve({ ok: true, normalized: parsed.iso });
}

module.exports = {
  validateReservationDate,
};

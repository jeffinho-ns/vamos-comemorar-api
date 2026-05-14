const businessRulesEngine = require('../services/businessRulesEngine');
const { validateEmail } = require('./emailValidator');
const { validateBirthDate } = require('./ageValidator');
const { validateReservationDate } = require('./dateValidator');
const { validateReservationTime } = require('./timeValidator');
const { getFieldsForStep } = require('../services/stateManager/conversationSteps');

function validatePositiveInteger(value, fieldName) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return {
      ok: false,
      code: 'INVALID_NUMBER',
      message: `Preciso de um valor numérico válido para ${fieldName}.`,
    };
  }
  return { ok: true, normalized: Math.trunc(numeric) };
}

function validateClientName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  const tokens = name.split(' ').filter(Boolean);
  if (tokens.length < 2) {
    return {
      ok: false,
      code: 'NAME_INCOMPLETE',
      message: 'Preciso do nome completo (nome e sobrenome) do titular da reserva.',
    };
  }
  if (name.length < 3) {
    return {
      ok: false,
      code: 'NAME_TOO_SHORT',
      message: 'O nome informado parece incompleto. Pode me enviar o nome completo?',
    };
  }
  return { ok: true, normalized: name };
}

async function validateField(fieldName, value, context = {}) {
  switch (fieldName) {
    case 'establishment_id':
      return validatePositiveInteger(value, 'estabelecimento');
    case 'area_id':
      return validatePositiveInteger(value, 'área');
    case 'quantidade_convidados': {
      const base = validatePositiveInteger(value, 'quantidade de pessoas');
      if (!base.ok) return base;
      const businessResult = businessRulesEngine.validateReservationPartySize({
        establishment_id: context.establishmentId,
        quantidade_convidados: base.normalized,
      });
      if (!businessResult.ok) return businessResult;
      return { ok: true, normalized: base.normalized };
    }
    case 'client_email':
      return validateEmail(value);
    case 'data_nascimento':
      return validateBirthDate(value);
    case 'client_name':
      return validateClientName(value);
    case 'reservation_date':
      return validateReservationDate(value, context);
    case 'reservation_time':
      return validateReservationTime(value, context);
    default:
      return { ok: true, normalized: value };
  }
}

async function validateFieldsForStep(step, candidateFields, context = {}) {
  const fieldNames = getFieldsForStep(step);
  const accepted = {};
  const failures = [];

  for (const fieldName of fieldNames) {
    const rawValue = candidateFields?.[fieldName];
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      continue;
    }

    const validation = await validateField(fieldName, rawValue, {
      ...context,
      establishmentId:
        context.establishmentId ||
        candidateFields.establishment_id ||
        context.collectedFields?.establishment_id,
      reservationDate:
        context.reservationDate ||
        candidateFields.reservation_date ||
        context.collectedFields?.reservation_date,
    });

    if (!validation.ok) {
      failures.push({ fieldName, ...validation });
      continue;
    }

    accepted[fieldName] = validation.normalized;
  }

  return {
    ok: failures.length === 0,
    accepted,
    failures,
  };
}

module.exports = {
  validateField,
  validateFieldsForStep,
};

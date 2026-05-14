const RESERVATION_FIELDS = [
  'establishment_id',
  'reservation_date',
  'reservation_time',
  'quantidade_convidados',
  'area_id',
  'client_name',
  'client_email',
  'data_nascimento',
];

const STEP_ORDER = [
  'greeting',
  'establishment',
  'date',
  'time',
  'party_size',
  'area',
  'identity',
  'confirm_summary',
  'submitting',
  'completed',
  'handoff',
];

const STEP_FIELDS = {
  greeting: [],
  establishment: ['establishment_id'],
  date: ['reservation_date'],
  time: ['reservation_time'],
  party_size: ['quantidade_convidados'],
  area: ['area_id'],
  identity: ['client_name', 'client_email', 'data_nascimento'],
  confirm_summary: [],
  submitting: [],
  completed: [],
  handoff: [],
};

const FIELD_STEP = {
  establishment_id: 'establishment',
  reservation_date: 'date',
  reservation_time: 'time',
  quantidade_convidados: 'party_size',
  area_id: 'area',
  client_name: 'identity',
  client_email: 'identity',
  data_nascimento: 'identity',
};

const FIELD_LABELS_PT = {
  establishment_id: 'estabelecimento',
  client_name: 'nome completo',
  client_email: 'e-mail',
  data_nascimento: 'data de nascimento',
  quantidade_convidados: 'quantidade de pessoas',
  reservation_date: 'data da reserva',
  reservation_time: 'horário',
  area_id: 'área',
};

const STEP_PROMPTS_PT = {
  greeting:
    'Oi! Que bom falar com você. Vamos começar sua reserva — em qual estabelecimento você quer reservar?',
  establishment: 'Perfeito. Em qual estabelecimento você quer reservar?',
  date: 'Qual data você prefere para a reserva?',
  time: 'Qual horário você prefere?',
  party_size: 'Para quantas pessoas será a reserva?',
  area: 'Qual área você prefere na casa?',
  identity:
    'Para finalizar, me envie seu nome completo, e-mail e data de nascimento (somente para confirmar +18).',
  confirm_summary:
    'Revisei os dados com você. Posso registrar a reserva agora com essas informações?',
};

function isTerminalStep(step) {
  return step === 'completed' || step === 'handoff';
}

function hasFieldValue(collectedFields, fieldName) {
  const value = collectedFields?.[fieldName];
  if (value === undefined || value === null || value === '') return false;
  if (['establishment_id', 'area_id', 'quantidade_convidados'].includes(fieldName)) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0;
  }
  return true;
}

function computeMissingFields(collectedFields, options = {}) {
  const collected = collectedFields && typeof collectedFields === 'object' ? collectedFields : {};
  const missing = [];

  for (const fieldName of RESERVATION_FIELDS) {
    if (fieldName === 'establishment_id' && options.lockedEstablishmentId) {
      continue;
    }
    if (!hasFieldValue(collected, fieldName)) {
      missing.push(fieldName);
    }
  }

  return missing;
}

function resolveStepForMissingField(fieldName) {
  return FIELD_STEP[fieldName] || 'greeting';
}

function resolveCurrentStep(collectedFields, options = {}) {
  const missing = computeMissingFields(collectedFields, options);
  if (missing.length === 0) {
    return 'confirm_summary';
  }
  return resolveStepForMissingField(missing[0]);
}

function getFieldsForStep(step) {
  return STEP_FIELDS[step] || [];
}

function getStepPrompt(step) {
  return STEP_PROMPTS_PT[step] || STEP_PROMPTS_PT.greeting;
}

function formatMissingFieldsForUser(missingKeys) {
  return (missingKeys || []).map((key) => FIELD_LABELS_PT[key] || key).join(', ');
}

module.exports = {
  RESERVATION_FIELDS,
  STEP_ORDER,
  STEP_FIELDS,
  FIELD_STEP,
  FIELD_LABELS_PT,
  STEP_PROMPTS_PT,
  isTerminalStep,
  hasFieldValue,
  computeMissingFields,
  resolveStepForMissingField,
  resolveCurrentStep,
  getFieldsForStep,
  getStepPrompt,
  formatMissingFieldsForUser,
};

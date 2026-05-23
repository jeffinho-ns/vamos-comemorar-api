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

const BUNDLE_FIELD_ORDER = [
  'reservation_date',
  'reservation_time',
  'quantidade_convidados',
  'area_id',
  'client_name',
  'client_email',
  'data_nascimento',
];

const COLLECT_BUNDLE_STEP = 'collect_bundle';
const OBSERVATIONS_STEP = 'observations';
const OBSERVATIONS_FIELD = 'reservation_notes';

const STEP_ORDER = [
  'greeting',
  'establishment',
  COLLECT_BUNDLE_STEP,
  OBSERVATIONS_STEP,
  'confirm_summary',
  'submitting',
  'completed',
  'handoff',
  // legado (ainda aceitos em histórico)
  'date',
  'time',
  'party_size',
  'area',
  'identity',
];

const STEP_FIELDS = {
  greeting: [],
  establishment: ['establishment_id'],
  collect_bundle: [...BUNDLE_FIELD_ORDER],
  observations: [OBSERVATIONS_FIELD],
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
  reservation_date: COLLECT_BUNDLE_STEP,
  reservation_time: COLLECT_BUNDLE_STEP,
  quantidade_convidados: COLLECT_BUNDLE_STEP,
  area_id: COLLECT_BUNDLE_STEP,
  client_name: COLLECT_BUNDLE_STEP,
  client_email: COLLECT_BUNDLE_STEP,
  data_nascimento: COLLECT_BUNDLE_STEP,
  [OBSERVATIONS_FIELD]: OBSERVATIONS_STEP,
};

const FIELD_LABELS_PT = {
  establishment_id: 'estabelecimento',
  client_name: 'nome completo',
  client_email: 'e-mail',
  data_nascimento: 'data de nascimento (DD/MM/AAAA)',
  quantidade_convidados: 'quantidade de pessoas',
  reservation_date: 'data da reserva',
  reservation_time: 'horário',
  area_id: 'área preferida (se tiver)',
  reservation_notes: 'observações',
};

const BUNDLE_LINE_PT = {
  establishment_id: '• Estabelecimento (se ainda não tiver escolhido)',
  reservation_date: '• Data (ex.: 25/05 ou próximo sábado)',
  reservation_time: '• Horário (ex.: 20h ou 20:30)',
  quantidade_convidados: '• Quantidade de pessoas',
  area_id: '• Área preferida (se tiver; senão eu escolho a melhor disponível)',
  client_name: '• Nome completo do titular',
  client_email: '• E-mail',
  data_nascimento: '• Data de nascimento (DD/MM/AAAA — confirma +18)',
};

const STEP_PROMPTS_PT = {
  greeting:
    'Oi! Que bom falar com você. Para agilizar, me envie em uma única mensagem os dados da reserva (data, horário, pessoas, nome completo, e-mail e data de nascimento). Se já souber a casa, pode incluir também.',
  establishment: 'Em qual estabelecimento você quer reservar? Depois te mando o bloco com o restante dos dados.',
  collect_bundle: '',
  observations:
    'Quer incluir algo nas observações da reserva? (aniversário, mesa perto do palco, restrição alimentar, comemoração especial…)\nSe não tiver nada a acrescentar, responda "não".',
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

function isObservationsStepComplete(collectedFields = {}, reservationContext = {}) {
  if (reservationContext?.observations_asked === true) return true;
  if (
    collectedFields[OBSERVATIONS_FIELD] !== undefined &&
    collectedFields[OBSERVATIONS_FIELD] !== null
  ) {
    return true;
  }
  return false;
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

function computeBundleMissingFields(collectedFields, options = {}) {
  const missing = computeMissingFields(collectedFields, options);
  return missing.filter((field) => field !== 'establishment_id');
}

function resolveStepForMissingField(fieldName) {
  return FIELD_STEP[fieldName] || COLLECT_BUNDLE_STEP;
}

function resolveCurrentStep(collectedFields, options = {}) {
  const missing = computeMissingFields(collectedFields, options);
  const reservationContext = options.reservationContext || {};

  if (missing.includes('establishment_id')) {
    return 'establishment';
  }

  const bundleMissing = computeBundleMissingFields(collectedFields, options);
  if (bundleMissing.length > 0) {
    return COLLECT_BUNDLE_STEP;
  }

  if (!isObservationsStepComplete(collectedFields, reservationContext)) {
    return OBSERVATIONS_STEP;
  }

  return 'confirm_summary';
}

function buildCollectBundlePrompt(collectedFields = {}, options = {}) {
  const missing = computeBundleMissingFields(collectedFields, options);
  if (missing.length === 0) {
    return STEP_PROMPTS_PT.observations;
  }

  const house = options.establishmentName ? ` no ${options.establishmentName}` : '';
  const lines = [
    `Para fechar sua reserva${house}, me envie numa única mensagem:`,
    '',
  ];

  for (const key of BUNDLE_FIELD_ORDER) {
    if (missing.includes(key) && BUNDLE_LINE_PT[key]) {
      lines.push(BUNDLE_LINE_PT[key]);
    }
  }
  if (missing.includes('establishment_id') && BUNDLE_LINE_PT.establishment_id) {
    lines.push(BUNDLE_LINE_PT.establishment_id);
  }

  lines.push('', 'Pode mandar tudo junto em um bloco — eu organizo por aqui.');

  const already = RESERVATION_FIELDS.filter((key) => hasFieldValue(collectedFields, key));
  if (already.length > 0) {
    const labels = already.map((key) => FIELD_LABELS_PT[key] || key).join(', ');
    lines.push('', `Já tenho anotado: ${labels}.`);
  }

  return lines.join('\n');
}

function getFieldsForStep(step) {
  return STEP_FIELDS[step] || [];
}

function getStepPrompt(step, collectedFields = {}, options = {}) {
  if (step === COLLECT_BUNDLE_STEP) {
    return buildCollectBundlePrompt(collectedFields, options);
  }
  return STEP_PROMPTS_PT[step] || STEP_PROMPTS_PT.greeting;
}

function formatMissingFieldsForUser(missingKeys) {
  return (missingKeys || []).map((key) => FIELD_LABELS_PT[key] || key).join(', ');
}

module.exports = {
  RESERVATION_FIELDS,
  BUNDLE_FIELD_ORDER,
  COLLECT_BUNDLE_STEP,
  OBSERVATIONS_STEP,
  OBSERVATIONS_FIELD,
  STEP_ORDER,
  STEP_FIELDS,
  FIELD_STEP,
  FIELD_LABELS_PT,
  STEP_PROMPTS_PT,
  isTerminalStep,
  hasFieldValue,
  computeMissingFields,
  computeBundleMissingFields,
  resolveStepForMissingField,
  resolveCurrentStep,
  buildCollectBundlePrompt,
  getFieldsForStep,
  getStepPrompt,
  formatMissingFieldsForUser,
  isObservationsStepComplete,
};

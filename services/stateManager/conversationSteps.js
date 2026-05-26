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

const OPERATIONAL_FIELDS = ['reservation_date', 'reservation_time', 'quantidade_convidados'];
const IDENTITY_FIELDS = ['client_name', 'client_email', 'data_nascimento'];

const FIELD_PHRASE_INLINE_PT = {
  reservation_date: 'a data (ex.: 25/05 ou próximo sábado)',
  reservation_time: 'o horário (ex.: 20h ou 20:30)',
  quantidade_convidados: 'quantas pessoas vão',
  client_name: 'o nome completo do titular',
  client_email: 'o e-mail',
  data_nascimento: 'a data de nascimento (DD/MM/AAAA — pra confirmar +18)',
  area_id: 'sua área preferida (se tiver; senão eu te indico a melhor)',
};

const STEP_PROMPTS_PT = {
  greeting:
    'Oi! Que bom falar com você. Para começar, me conta: para quando seria a reserva?',
  establishment:
    'Pra qual casa você quer reservar? Assim que me disser eu já te ajudo com data e horários.',
  collect_bundle: '',
  observations:
    'Quer deixar alguma observação na reserva? (ex.: aniversário, mesa mais reservada, restrição alimentar). Se não, é só dizer "não" que eu fecho aqui.',
  confirm_summary:
    'Revisei tudo aqui. Posso registrar a reserva agora com essas informações?',
};

function joinPhrasesPt(items = []) {
  const list = items.filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} e ${list[1]}`;
  return `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`;
}

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

/**
 * Coleta progressiva e humanizada — pede no máximo 3 campos por vez:
 *   Etapa 1: data + horário + pessoas (o trio operacional que valida vaga).
 *   Etapa 2: nome + e-mail + nascimento (identidade do titular).
 *   Etapa 3: observações / preferências.
 *
 * As frases são curtas e conversadas, sem bullet list. Quando falta só 1 campo,
 * pergunta direto. Quando faltam 2-3, junta em uma frase só.
 */
function buildCollectBundlePrompt(collectedFields = {}, options = {}) {
  const missing = computeBundleMissingFields(collectedFields, options);
  if (missing.length === 0) {
    return STEP_PROMPTS_PT.observations;
  }

  const operationalMissing = OPERATIONAL_FIELDS.filter((key) => missing.includes(key));
  const identityMissing = IDENTITY_FIELDS.filter((key) => missing.includes(key));

  // Etapa 1: faltam dados operacionais — pede só esse trio primeiro.
  if (operationalMissing.length > 0) {
    if (operationalMissing.length === OPERATIONAL_FIELDS.length) {
      const collectedAny =
        hasFieldValue(collectedFields, 'establishment_id') &&
        Object.keys(collectedFields).some((key) =>
          ['client_name', 'client_email', 'data_nascimento'].includes(key) &&
          hasFieldValue(collectedFields, key)
        );
      if (collectedAny) {
        return 'Show! Para eu já ver se tem vaga, me conta a data, o horário e quantas pessoas vão.';
      }
      return 'Pra eu já consultar a agenda, me passa por favor a data, o horário e quantas pessoas vão.';
    }
    if (operationalMissing.length === 1) {
      const onlyKey = operationalMissing[0];
      if (onlyKey === 'reservation_date') return 'Pra quando seria a reserva?';
      if (onlyKey === 'reservation_time') return 'E qual horário fica melhor pra você?';
      if (onlyKey === 'quantidade_convidados') return 'Quantas pessoas vão com você?';
    }
    const phrases = operationalMissing.map((key) => FIELD_PHRASE_INLINE_PT[key] || key);
    return `Pra eu acertar tudo, me confirma ${joinPhrasesPt(phrases)}?`;
  }

  // Etapa 2: já tem trio operacional — pede identidade do titular.
  if (identityMissing.length > 0) {
    if (identityMissing.length === IDENTITY_FIELDS.length) {
      return 'Show, vaga confirmada. Agora pra deixar a reserva no seu nome, me passa o nome completo, o e-mail e a data de nascimento (DD/MM/AAAA — pra confirmar +18).';
    }
    if (identityMissing.length === 1) {
      const onlyKey = identityMissing[0];
      if (onlyKey === 'client_name') return 'Me confirma seu nome completo, por favor?';
      if (onlyKey === 'client_email') return 'E seu e-mail?';
      if (onlyKey === 'data_nascimento')
        return 'Por último, sua data de nascimento (DD/MM/AAAA) pra eu confirmar +18.';
    }
    const phrases = identityMissing.map((key) => FIELD_PHRASE_INLINE_PT[key] || key);
    return `Falta pouco — me manda ${joinPhrasesPt(phrases)}?`;
  }

  // Casos residuais (area / estabelecimento) — perguntas curtas.
  if (missing.includes('establishment_id')) {
    return 'Em qual casa você quer reservar?';
  }
  if (missing.includes('area_id')) {
    return 'Tem alguma área preferida (deck, bar, rooftop)? Se não, eu te indico a melhor disponível.';
  }

  // Fallback defensivo (não deveria cair aqui).
  const phrases = missing.map((key) => FIELD_PHRASE_INLINE_PT[key] || FIELD_LABELS_PT[key] || key);
  return `Pra fechar, ainda preciso de ${joinPhrasesPt(phrases)}.`;
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

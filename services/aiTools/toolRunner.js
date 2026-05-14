const businessRulesEngine = require('../businessRulesEngine');

function getToolDefinitions() {
  return [
    {
      type: 'function',
      function: {
        name: 'checkAvailability',
        description:
          'Consulta disponibilidade operacional (fechado, janelas de horário) para um estabelecimento e data.',
        parameters: {
          type: 'object',
          properties: {
            establishment_id: { type: 'integer' },
            reservation_date: { type: 'string', description: 'YYYY-MM-DD' },
            quantidade_convidados: { type: 'integer' },
          },
          required: ['establishment_id', 'reservation_date'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'getDateOverride',
        description: 'Consulta exceção operacional cadastrada para uma data específica.',
        parameters: {
          type: 'object',
          properties: {
            establishment_id: { type: 'integer' },
            reservation_date: { type: 'string', description: 'YYYY-MM-DD' },
          },
          required: ['establishment_id', 'reservation_date'],
          additionalProperties: false,
        },
      },
    },
  ];
}

async function checkAvailability(pool, args = {}) {
  const establishmentId = Number(args.establishment_id);
  const reservationDate = String(args.reservation_date || '').slice(0, 10);
  const partySize = Number(args.quantidade_convidados);

  if (!Number.isFinite(establishmentId) || establishmentId <= 0 || !reservationDate) {
    return { ok: false, error: 'establishment_id e reservation_date são obrigatórios.' };
  }

  const override = await businessRulesEngine.getDateOverride(pool, establishmentId, reservationDate);
  if (override && override.is_open === false) {
    return {
      ok: true,
      establishment_id: establishmentId,
      reservation_date: reservationDate,
      is_open: false,
      windows: [],
      note: override.note || null,
    };
  }

  const windows = await businessRulesEngine.getOperatingWindowsForDate(
    pool,
    establishmentId,
    reservationDate
  );

  const partyValidation = Number.isFinite(partySize)
    ? businessRulesEngine.validateReservationPartySize({
        establishment_id: establishmentId,
        quantidade_convidados: partySize,
      })
    : { ok: true };

  return {
    ok: true,
    establishment_id: establishmentId,
    reservation_date: reservationDate,
    is_open: windows.length > 0,
    windows,
    override: override || null,
    party_size_allowed: partyValidation.ok,
    party_size_message: partyValidation.ok ? null : partyValidation.message,
  };
}

async function getDateOverride(pool, args = {}) {
  const establishmentId = Number(args.establishment_id);
  const reservationDate = String(args.reservation_date || '').slice(0, 10);
  if (!Number.isFinite(establishmentId) || establishmentId <= 0 || !reservationDate) {
    return { ok: false, error: 'establishment_id e reservation_date são obrigatórios.' };
  }
  const override = await businessRulesEngine.getDateOverride(pool, establishmentId, reservationDate);
  return {
    ok: true,
    establishment_id: establishmentId,
    reservation_date: reservationDate,
    override: override || null,
    notice: businessRulesEngine.buildOverrideNotice(override),
  };
}

async function executeToolCall(pool, toolCall) {
  const toolName = toolCall?.function?.name;
  let args = {};
  try {
    args = JSON.parse(toolCall?.function?.arguments || '{}');
  } catch (_error) {
    args = {};
  }

  if (toolName === 'checkAvailability') {
    return checkAvailability(pool, args);
  }
  if (toolName === 'getDateOverride') {
    return getDateOverride(pool, args);
  }
  return { ok: false, error: `Tool desconhecida: ${toolName}` };
}

function shouldEnableTools(context = {}) {
  const step = String(context.conversationStep || '').trim();
  if (['date', 'time', 'confirm_summary'].includes(step)) return true;
  return Boolean(context.needsAvailabilityTool);
}

module.exports = {
  getToolDefinitions,
  executeToolCall,
  shouldEnableTools,
  checkAvailability,
  getDateOverride,
};

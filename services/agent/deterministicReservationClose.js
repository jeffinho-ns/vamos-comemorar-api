/**
 * Fecha pré-reserva sem round LLM quando o workingState já tem todos os dados.
 * Consulta área Highline no sistema antes de criar — mesma fonte do painel.
 */

const { executeAgentToolCall, consultHighlineReservationAreas } = require('./agentTools');
const { resolveHighlineSubarea } = require('./highlineReservationAreas');
const { getReservationMissingFields } = require('./reservationFunnel');
const { mergeWorkingState, extractWorkingStatePatchFromToolResult } = require('./agentMemoryService');
const { recordZeroTokenPath } = require('./aiUsageRepository');

const HIGHLINE_ESTABLISHMENT_ID = Number(process.env.HIGHLINE_ESTABLISHMENT_ID || 7);

function isHighlineEstablishment(establishmentId) {
  return Number(establishmentId) === HIGHLINE_ESTABLISHMENT_ID;
}

function reservationFunnelIsComplete(workingState = {}) {
  return getReservationMissingFields(workingState).length === 0;
}

function buildCreatePreReservaArgs(workingState = {}, context = {}, areaLabel = '') {
  const establishmentId = Number(
    workingState.establishment_id || context.lockedEstablishmentId
  );
  const reservationDate = String(
    workingState.reservation_date || workingState.pending_reservation_date_iso || ''
  ).slice(0, 10);
  const reservationTime = String(workingState.reservation_time || '').slice(0, 5);
  const partySize = Number(workingState.quantidade_convidados);
  const clientName = String(workingState.client_name || '').trim();
  const clientEmail = String(workingState.client_email || '').trim();
  const birthDate = String(workingState.data_nascimento || '').slice(0, 10);
  const area = String(
    areaLabel || workingState.area_label || workingState.area_preferida || ''
  ).trim();

  if (
    !Number.isFinite(establishmentId) ||
    establishmentId <= 0 ||
    !reservationDate ||
    !reservationTime ||
    !Number.isFinite(partySize) ||
    partySize <= 0 ||
    !clientName ||
    !clientEmail ||
    !birthDate ||
    !area
  ) {
    return null;
  }

  return {
    estabelecimento_id: establishmentId,
    data: reservationDate,
    horario: reservationTime,
    quantidade_pessoas: partySize,
    area,
    cliente_dados: {
      nome: clientName,
      email: clientEmail,
      data_nascimento: birthDate,
    },
    observacoes: String(workingState.observacoes || '').trim() || undefined,
  };
}

async function resolveAreaLabelForCreate(pool, workingState, context, userText = '') {
  const establishmentId = Number(
    workingState.establishment_id || context.lockedEstablishmentId
  );
  // Preferência do turno atual (ex.: "quero Mesas Redondas") vence área antiga no estado.
  const fromUserText = resolveHighlineSubarea(userText)?.label || '';
  const preferred =
    fromUserText ||
    String(workingState.area_label || workingState.area_preferida || '').trim();

  if (!isHighlineEstablishment(establishmentId) || !pool) {
    // Casas não-Highline: criar_pre_reserva resolve área padrão no backend.
    return { label: preferred || 'padrão', snapshot: null };
  }

  const reservationDate = String(
    workingState.reservation_date || workingState.pending_reservation_date_iso || ''
  ).slice(0, 10);
  const partySize = Number(workingState.quantidade_convidados);
  const reservationTime = String(workingState.reservation_time || '').slice(0, 5) || null;

  // Sempre consulta o painel: respeita preferência do cliente, mas só fecha com vaga real.
  const snapshot = await consultHighlineReservationAreas(pool, {
    estabelecimento_id: establishmentId,
    data: reservationDate,
    quantidade_pessoas: partySize,
    horario: reservationTime || undefined,
    area_preferida: preferred || undefined,
    contexto_cliente: userText || preferred,
  }).catch(() => null);

  if (snapshot?.todas_areas_cheias) {
    return { todasCheias: true, snapshot };
  }

  const preferredStillFree =
    preferred &&
    Array.isArray(snapshot?.areas_com_vaga_labels) &&
    snapshot.areas_com_vaga_labels.some(
      (label) => resolveHighlineSubarea(label)?.label === resolveHighlineSubarea(preferred)?.label
    );

  const label =
    (preferredStillFree && preferred) ||
    snapshot?.area_recomendada?.label ||
    (Array.isArray(snapshot?.areas_com_vaga_labels) && snapshot.areas_com_vaga_labels[0]) ||
    preferred ||
    'Deck - Mesas';

  return { label, snapshot };
}

/**
 * Se o funil está completo, cria a pré-reserva direto no banco (0 tokens LLM).
 * Retorna null se ainda falta dado ou se não deve fechar neste turno.
 */
async function tryDeterministicReservationClose({
  pool,
  workingState,
  context = {},
  runtimeContext = {},
  toolTrace = [],
  userText = '',
}) {
  if (!pool) return null;
  if (!reservationFunnelIsComplete(workingState)) return null;

  const alreadyCreated = (toolTrace || []).some(
    (entry) => entry?.name === 'criar_pre_reserva' && entry?.result?.ok
  );
  if (alreadyCreated) return null;

  let nextState = { ...workingState };
  let nextTrace = [...(toolTrace || [])];

  const areaResolution = await resolveAreaLabelForCreate(pool, nextState, context, userText);
  if (areaResolution?.todasCheias) {
    nextTrace.push({
      name: 'consultar_areas_mesa_reserva',
      result: areaResolution.snapshot,
      auto: true,
    });
    await recordZeroTokenPath(pool, {
      path: 'reservation_deterministic',
      meta: { step: 'areas_full', establishment_id: nextState.establishment_id },
    }).catch(() => {});
    return {
      workingState: nextState,
      toolTrace: nextTrace,
      replyText:
        areaResolution.snapshot?.mensagem_hostess ||
        'Olha, tá tudo cheio nesse dia. Posso te colocar na lista de espera — assim que abrir mesa eu te chamo aqui mesmo, beleza?',
      preReservationResult: null,
      guestListLink: null,
      deterministic: true,
      areasFull: true,
    };
  }

  const areaLabel =
    typeof areaResolution === 'string' ? areaResolution : areaResolution?.label || 'Deck - Mesas';
  if (areaResolution?.snapshot) {
    nextTrace.push({
      name: 'consultar_areas_mesa_reserva',
      result: areaResolution.snapshot,
      auto: true,
    });
    nextState = mergeWorkingState(
      nextState,
      extractWorkingStatePatchFromToolResult('consultar_areas_mesa_reserva', areaResolution.snapshot),
      { area_label: areaLabel }
    );
  } else if (areaLabel) {
    nextState = mergeWorkingState(nextState, { area_label: areaLabel });
  }

  const args = buildCreatePreReservaArgs(nextState, context, areaLabel);
  if (!args) return null;

  const toolResult = await executeAgentToolCall(
    pool,
    {
      id: `deterministic-create-${Date.now()}`,
      function: {
        name: 'criar_pre_reserva',
        arguments: JSON.stringify(args),
      },
    },
    runtimeContext
  ).catch((error) => {
    console.warn('[deterministicReservationClose] criar_pre_reserva falhou:', error.message);
    return { ok: false, error: error.message || 'Falha ao criar pré-reserva.' };
  });

  nextTrace.push({ name: 'criar_pre_reserva', result: toolResult, forced: true, deterministic: true });
  nextState = mergeWorkingState(
    nextState,
    extractWorkingStatePatchFromToolResult('criar_pre_reserva', toolResult)
  );

  await recordZeroTokenPath(pool, {
    path: 'reservation_deterministic',
    meta: {
      step: toolResult?.ok ? 'created' : 'create_failed',
      establishment_id: args.estabelecimento_id,
      area: args.area,
      date: args.data,
      party: args.quantidade_pessoas,
    },
  }).catch(() => {});

  return {
    workingState: nextState,
    toolTrace: nextTrace,
    toolResult,
    preReservationResult: toolResult?.ok ? toolResult : null,
    guestListLink: toolResult?.ok ? toolResult.guest_list_link || null : null,
    deterministic: true,
  };
}

module.exports = {
  buildCreatePreReservaArgs,
  reservationFunnelIsComplete,
  tryDeterministicReservationClose,
  resolveAreaLabelForCreate,
};

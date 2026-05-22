const FIELD_LABELS = {
  establishment_id: 'estabelecimento',
  establishment_name: 'nome do estabelecimento',
  reservation_date: 'data',
  reservation_time: 'horário',
  quantidade_convidados: 'pessoas',
  area_id: 'área',
  client_name: 'nome',
  client_email: 'e-mail',
  data_nascimento: 'nascimento',
};

function hasValue(value) {
  if (value === undefined || value === null || value === '') return false;
  if (['establishment_id', 'area_id', 'quantidade_convidados'].includes(String(value))) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0;
  }
  return true;
}

function buildSummaryFromWorkingState(workingState = {}) {
  const parts = [];
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    if (!hasValue(workingState[key])) continue;
    parts.push(`${label}: ${workingState[key]}`);
  }
  if (parts.length === 0) {
    return 'Contexto atual: conversa em andamento; estabelecimento e data ainda não confirmados.';
  }
  return `Contexto atual: ${parts.join('; ')}.`;
}

function mergeWorkingState(current = {}, patch = {}) {
  const next = { ...(current || {}) };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value === undefined || value === null || value === '') continue;
    next[key] = value;
  }
  return next;
}

async function getMemory(pool, conversationId) {
  const normalizedId = Number(conversationId);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
    return {
      contextSummary: '',
      workingState: {},
    };
  }

  try {
    const result = await pool.query(
      `SELECT context_summary, working_state
         FROM agent_conversation_context
        WHERE conversation_id = $1
        LIMIT 1`,
      [normalizedId]
    );
    const row = result.rows[0];
    if (!row) {
      return {
        contextSummary: '',
        workingState: {},
      };
    }
    const workingState =
      row.working_state && typeof row.working_state === 'object' ? row.working_state : {};
    return {
      contextSummary: String(row.context_summary || '').trim(),
      workingState,
    };
  } catch (_error) {
    return {
      contextSummary: '',
      workingState: {},
    };
  }
}

async function persistMemory(pool, conversationId, { workingState = {}, contextSummary = null } = {}) {
  const normalizedId = Number(conversationId);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) return null;

  const summary =
    contextSummary !== null && contextSummary !== undefined
      ? String(contextSummary).trim()
      : buildSummaryFromWorkingState(workingState);

  const result = await pool.query(
    `INSERT INTO agent_conversation_context (conversation_id, context_summary, working_state, updated_at)
     VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (conversation_id) DO UPDATE SET
       context_summary = EXCLUDED.context_summary,
       working_state = EXCLUDED.working_state,
       updated_at = NOW()
     RETURNING context_summary, working_state, updated_at`,
    [normalizedId, summary, JSON.stringify(workingState || {})]
  );
  return result.rows[0] || null;
}

function extractWorkingStatePatchFromToolResult(toolName, toolResult = {}) {
  if (!toolResult || toolResult.ok === false) return {};

  if (toolName === 'verificar_disponibilidade') {
    return {
      establishment_id: toolResult.estabelecimento_id,
      reservation_date: toolResult.reservation_date,
      quantidade_convidados: toolResult.quantidade_pessoas,
    };
  }

  if (toolName === 'consultar_areas_mesa_reserva' && toolResult.area_recomendada?.area_id) {
    return {
      establishment_id: toolResult.estabelecimento_id,
      reservation_date: toolResult.reservation_date,
      quantidade_convidados: toolResult.quantidade_pessoas,
      area_id: toolResult.area_recomendada.area_id,
    };
  }

  if (toolName === 'criar_pre_reserva' && toolResult.pre_reserva) {
    const pre = toolResult.pre_reserva;
    return {
      establishment_id: pre.establishment_id,
      reservation_date: pre.reservation_date,
      reservation_time: pre.reservation_time,
      quantidade_convidados: pre.quantidade_pessoas,
      area_id: pre.area_id,
      client_name: pre.cliente?.nome,
      client_email: pre.cliente?.email,
      data_nascimento: pre.cliente?.data_nascimento,
    };
  }

  return {};
}

module.exports = {
  buildSummaryFromWorkingState,
  mergeWorkingState,
  getMemory,
  persistMemory,
  extractWorkingStatePatchFromToolResult,
};

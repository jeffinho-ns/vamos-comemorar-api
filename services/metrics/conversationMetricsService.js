const EVENT_TYPES = {
  STEP_ENTERED: 'step_entered',
  STEP_ABANDONED: 'step_abandoned',
  BOT_LOOP: 'bot_loop',
  HUMAN_HANDOFF: 'human_handoff',
  CONVERSION_COMPLETED: 'conversion_completed',
  VALIDATION_FAILURE: 'validation_failure',
};

function normalizeDateRange(filters = {}) {
  const to = filters.to ? new Date(filters.to) : new Date();
  const from = filters.from
    ? new Date(filters.from)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

  return {
    from: Number.isNaN(from.getTime()) ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) : from,
    to: Number.isNaN(to.getTime()) ? new Date() : to,
  };
}

function buildScopeClause(filters = {}, params, baseParamCount = 2) {
  const clauses = [];
  if (filters.establishmentId) {
    params.push(Number(filters.establishmentId));
    clauses.push(`establishment_id = $${baseParamCount + clauses.length + 1}`);
  }
  return clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
}

async function recordEvent(pool, event) {
  if (!pool || !event?.eventType) return null;

  const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};

  const result = await pool.query(
    `INSERT INTO conversation_funnel_events (
       event_type, conversation_id, session_id, wa_id, establishment_id,
       step, previous_step, retry_count, payload
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     RETURNING id, occurred_at`,
    [
      event.eventType,
      event.conversationId || null,
      event.sessionId || null,
      event.waId || null,
      event.establishmentId || null,
      event.step || null,
      event.previousStep || null,
      Number.isFinite(Number(event.retryCount)) ? Number(event.retryCount) : null,
      JSON.stringify(payload),
    ]
  );

  return result.rows[0] || null;
}

async function getFunnelSummary(pool, filters = {}) {
  const range = normalizeDateRange(filters);
  const params = [range.from, range.to];
  const scope = buildScopeClause({ ...filters, ...range }, params);

  const result = await pool.query(
    `SELECT step,
            COUNT(*) FILTER (WHERE event_type = $${params.length + 1})::int AS entered,
            COUNT(*) FILTER (WHERE event_type = $${params.length + 2})::int AS abandoned,
            COUNT(*) FILTER (WHERE event_type = $${params.length + 3})::int AS completed
       FROM conversation_funnel_events
      WHERE occurred_at >= $1
        AND occurred_at <= $2
        ${scope}
        AND step IS NOT NULL
      GROUP BY step
      ORDER BY MIN(occurred_at) ASC`,
    [
      ...params,
      EVENT_TYPES.STEP_ENTERED,
      EVENT_TYPES.STEP_ABANDONED,
      EVENT_TYPES.CONVERSION_COMPLETED,
    ]
  );

  const rows = result.rows || [];
  const totals = rows.reduce(
    (acc, row) => {
      acc.entered += Number(row.entered) || 0;
      acc.abandoned += Number(row.abandoned) || 0;
      acc.completed += Number(row.completed) || 0;
      return acc;
    },
    { entered: 0, abandoned: 0, completed: 0 }
  );

  const conversionRate =
    totals.entered > 0 ? Number(((totals.completed / totals.entered) * 100).toFixed(2)) : 0;

  return {
    period: { from: range.from.toISOString(), to: range.to.toISOString() },
    totals,
    conversionRate,
    steps: rows.map((row) => ({
      step: row.step,
      entered: Number(row.entered) || 0,
      abandoned: Number(row.abandoned) || 0,
      completed: Number(row.completed) || 0,
      dropoffRate:
        Number(row.entered) > 0
          ? Number((((Number(row.abandoned) || 0) / Number(row.entered)) * 100).toFixed(2))
          : 0,
    })),
  };
}

async function getDropoffByStep(pool, filters = {}) {
  const summary = await getFunnelSummary(pool, filters);
  return {
    period: summary.period,
    steps: summary.steps
      .map((step) => ({
        step: step.step,
        abandoned: step.abandoned,
        dropoffRate: step.dropoffRate,
      }))
      .sort((a, b) => b.dropoffRate - a.dropoffRate),
  };
}

async function getHandoffMetrics(pool, filters = {}) {
  const range = normalizeDateRange(filters);
  const params = [range.from, range.to];
  const scope = buildScopeClause({ ...filters, ...range }, params);

  const result = await pool.query(
    `SELECT COUNT(*)::int AS handoffs,
            COUNT(DISTINCT conversation_id)::int AS conversations
       FROM conversation_funnel_events
      WHERE occurred_at >= $1
        AND occurred_at <= $2
        ${scope}
        AND event_type = $${params.length + 1}`,
    [...params, EVENT_TYPES.HUMAN_HANDOFF]
  );

  const row = result.rows[0] || { handoffs: 0, conversations: 0 };
  const enteredResult = await pool.query(
    `SELECT COUNT(*)::int AS entered
       FROM conversation_funnel_events
      WHERE occurred_at >= $1
        AND occurred_at <= $2
        ${scope}
        AND event_type = $${params.length + 1}`,
    [...params, EVENT_TYPES.STEP_ENTERED]
  );

  const entered = Number(enteredResult.rows[0]?.entered) || 0;
  const handoffs = Number(row.handoffs) || 0;

  return {
    period: { from: range.from.toISOString(), to: range.to.toISOString() },
    handoffs,
    conversations: Number(row.conversations) || 0,
    handoffRate: entered > 0 ? Number(((handoffs / entered) * 100).toFixed(2)) : 0,
  };
}

async function getBotLoopMetrics(pool, filters = {}) {
  const range = normalizeDateRange(filters);
  const params = [range.from, range.to];
  const scope = buildScopeClause({ ...filters, ...range }, params);

  const result = await pool.query(
    `SELECT step,
            COUNT(*)::int AS loops,
            AVG(COALESCE(retry_count, 0))::numeric(10,2) AS avg_retry_count
       FROM conversation_funnel_events
      WHERE occurred_at >= $1
        AND occurred_at <= $2
        ${scope}
        AND event_type = $${params.length + 1}
      GROUP BY step
      ORDER BY loops DESC`,
    [...params, EVENT_TYPES.BOT_LOOP]
  );

  const totals = (result.rows || []).reduce((acc, row) => acc + (Number(row.loops) || 0), 0);

  return {
    period: { from: range.from.toISOString(), to: range.to.toISOString() },
    totalLoops: totals,
    byStep: (result.rows || []).map((row) => ({
      step: row.step,
      loops: Number(row.loops) || 0,
      avgRetryCount: Number(row.avg_retry_count) || 0,
    })),
  };
}

async function getOverview(pool, filters = {}) {
  const [funnel, handoff, loops] = await Promise.all([
    getFunnelSummary(pool, filters),
    getHandoffMetrics(pool, filters),
    getBotLoopMetrics(pool, filters),
  ]);

  return {
    period: funnel.period,
    funnel,
    handoff,
    loops,
  };
}

module.exports = {
  EVENT_TYPES,
  recordEvent,
  getFunnelSummary,
  getDropoffByStep,
  getHandoffMetrics,
  getBotLoopMetrics,
  getOverview,
};

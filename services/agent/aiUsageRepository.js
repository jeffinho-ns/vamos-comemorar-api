const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function runWithOpenAiUsageContext(context, fn) {
  return storage.run(context || {}, fn);
}

function getOpenAiUsageContext() {
  return storage.getStore() || {};
}

function extractUsageFields(usage) {
  const u = usage && typeof usage === 'object' ? usage : {};
  const promptTokens = Number.isFinite(Number(u.prompt_tokens))
    ? Number(u.prompt_tokens)
    : null;
  const completionTokens = Number.isFinite(Number(u.completion_tokens))
    ? Number(u.completion_tokens)
    : null;
  const totalTokens = Number.isFinite(Number(u.total_tokens))
    ? Number(u.total_tokens)
    : null;
  const cachedRaw = u?.prompt_tokens_details?.cached_tokens;
  const cachedTokens = Number.isFinite(Number(cachedRaw)) ? Number(cachedRaw) : null;

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    cachedTokens,
  };
}

async function recordOpenAiUsage(
  pool,
  {
    establishmentId = null,
    conversationId = null,
    waId = null,
    path,
    model = null,
    usage = null,
    requestId = null,
    meta = null,
  } = {}
) {
  if (!pool) return;
  const normalizedPath = String(path || '').trim();
  if (!normalizedPath) return;

  const {
    promptTokens,
    completionTokens,
    totalTokens,
    cachedTokens,
  } = extractUsageFields(usage || {});

  const establishment =
    Number.isFinite(Number(establishmentId)) && Number(establishmentId) > 0
      ? Number(establishmentId)
      : null;
  const conversation =
    Number.isFinite(Number(conversationId)) && Number(conversationId) > 0
      ? Number(conversationId)
      : null;
  const wa = waId != null ? String(waId).trim() || null : null;
  const metaJson =
    meta && typeof meta === 'object' && !Array.isArray(meta) ? JSON.stringify(meta) : null;

  await pool.query(
    `INSERT INTO openai_usage_events (
       establishment_id,
       conversation_id,
       wa_id,
       path,
       model,
       prompt_tokens,
       completion_tokens,
       total_tokens,
       cached_tokens,
       request_id,
       meta
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
    [
      establishment,
      conversation,
      wa,
      normalizedPath,
      model ? String(model) : null,
      promptTokens,
      completionTokens,
      totalTokens,
      cachedTokens,
      requestId ? String(requestId) : null,
      metaJson,
    ]
  );
}

async function recordOpenAiUsageSafe(pool, payload = {}) {
  try {
    const ctx = getOpenAiUsageContext();
    const mergedPool = pool || ctx.pool || null;
    if (!mergedPool) return;

    await recordOpenAiUsage(mergedPool, {
      establishmentId: payload.establishmentId ?? ctx.establishmentId ?? null,
      conversationId: payload.conversationId ?? ctx.conversationId ?? null,
      waId: payload.waId ?? ctx.waId ?? null,
      path: payload.path ?? ctx.path ?? 'other',
      model: payload.model ?? null,
      usage: payload.usage ?? null,
      requestId: payload.requestId ?? null,
      meta: payload.meta ?? null,
    });
  } catch (error) {
    console.warn('[aiUsageRepository] falha ao registrar uso OpenAI:', error.message);
  }
}

module.exports = {
  runWithOpenAiUsageContext,
  getOpenAiUsageContext,
  extractUsageFields,
  recordOpenAiUsage,
  recordOpenAiUsageSafe,
};

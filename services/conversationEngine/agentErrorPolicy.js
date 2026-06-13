function classifyAgentRuntimeError(error) {
  const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
  const code = String(error?.code || '').toUpperCase();
  const detail = String(error?.message || error?.error?.message || 'erro_desconhecido');
  const normalizedDetail = detail.toLowerCase();
  if (/missing credentials|api[_\s-]?key|no api key/i.test(detail)) {
    return 'OPENAI_MISSING_CREDENTIALS';
  }
  if (/invalid api key|incorrect api key|authentication/i.test(normalizedDetail)) {
    return 'OPENAI_AUTH';
  }
  if (/model/i.test(detail) && /(not found|does not exist|not available|do not have access|insufficient)/i.test(detail)) {
    return 'OPENAI_MODEL_ACCESS';
  }
  if (status === 429 || /rate limit|too many/i.test(detail)) return 'OPENAI_429';
  if (status >= 500) return `OPENAI_${status}`;
  if (code === 'OPENAI_TIMEOUT' || /timeout|timed out/i.test(detail)) return 'OPENAI_TIMEOUT';
  if (code === 'ECONNRESET' || code === 'ECONNABORTED') return code;
  return 'AGENT_RUNTIME_ERROR';
}

function buildAgentRuntimeErrorMeta(error, errorCode) {
  const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
  const code = String(error?.code || '').toUpperCase();
  const modelName = String(error?.modelName || '');
  return {
    errorCode,
    status: Number.isFinite(status) && status > 0 ? status : null,
    providerCode: code || null,
    model: modelName || null,
    detail: String(error?.message || error?.error?.message || '').slice(0, 240) || null,
  };
}

function shouldImmediateHumanHandoffOnAgentError(errorCode) {
  const env = String(process.env.AGENT_ERROR_IMMEDIATE_HANDOFF ?? 'false')
    .trim()
    .toLowerCase();
  if (!['1', 'true', 'yes', 'on'].includes(env)) return false;

  // Erros transitórios da OpenAI não devem pausar a IA por 48h: isso derruba
  // a conversão justamente quando o provedor oscila. Handoff automático fica
  // restrito a problemas estruturais que a próxima mensagem não vai corrigir.
  return ['OPENAI_MISSING_CREDENTIALS', 'OPENAI_AUTH', 'OPENAI_MODEL_ACCESS'].includes(
    String(errorCode || '')
  );
}

module.exports = {
  classifyAgentRuntimeError,
  buildAgentRuntimeErrorMeta,
  shouldImmediateHumanHandoffOnAgentError,
};

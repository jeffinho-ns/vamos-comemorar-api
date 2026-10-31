/**
 * Frase curta quando a prosa da Sol estoura o timeout.
 * Não chama OpenAI e não cai em outro modelo.
 */

const TIME_ONLY_REPLY = 'Sigo com a sua reserva — qual horário fica melhor pra você?';

function asRecord(value) {
  if (!value || typeof value !== 'object') return {};
  return value;
}

function parseClock(raw) {
  const text = String(raw || '').trim();
  if (!text || /\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/.test(text)) return null;
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return { hour, minute: match[2] };
}

function speakTime(raw) {
  const clock = parseClock(raw);
  if (!clock) return '';
  if (clock.minute === '00') return `${clock.hour}h`;
  return `${String(clock.hour).padStart(2, '0')}:${clock.minute}`;
}

function readLastConsultedTime(toolTrace) {
  const trace = Array.isArray(toolTrace) ? toolTrace : [];
  for (let index = trace.length - 1; index >= 0; index -= 1) {
    const entry = trace[index];
    if (entry?.name !== 'verificar_disponibilidade') continue;
    return speakTime(entry?.result?.horario_consultado);
  }
  return '';
}

function resolveSpokenTime(state, toolTrace) {
  const fromState = speakTime(state.reservation_time);
  if (fromState) return fromState;
  return readLastConsultedTime(toolTrace);
}

function hasPeople(state) {
  const count = Number(state.quantidade_convidados);
  return Number.isFinite(count) && count > 0;
}

function hasArea(state) {
  const areaId = Number(state.area_id);
  if (Number.isFinite(areaId) && areaId > 0) return true;
  const labels = [state.area_label, state.area_name, state.area, state.area_preferida, state.justino_zone];
  return labels.some((value) => String(value || '').trim().length > 0);
}

function hasName(state) {
  return String(state.client_name || '').trim().length > 0;
}

function nextMissingAsk(state) {
  if (!hasPeople(state)) return 'quantas pessoas vão com você?';
  if (!hasArea(state)) return 'qual área você prefere?';
  if (!hasName(state)) return 'qual nome você usa na reserva?';
  return 'posso seguir com esses dados pra você?';
}

function buildTimeoutFallbackReply(workingState = {}, options = {}) {
  const state = asRecord(workingState);
  const spoken = resolveSpokenTime(state, asRecord(options).toolTrace);
  if (!spoken) return TIME_ONLY_REPLY;
  return `Sigo com a sua reserva às ${spoken} — ${nextMissingAsk(state)}`;
}

function shouldUseTimeoutFallback(error) {
  if (error == null || error === '') return false;
  if (typeof error === 'object' && error.code === 'OPENAI_TIMEOUT') return true;
  const message = typeof error === 'string' ? error : String(error.message || '');
  if (/timeout após \d+ms/i.test(message)) return true;
  return /timed out/i.test(message);
}

module.exports = {
  buildTimeoutFallbackReply,
  shouldUseTimeoutFallback,
};

'use strict';

/**
 * Fast path: contagem de reservas por dia/período sem LLM.
 * Corrige o caso em que o modelo pedia datas de novo ou lia DD/MM como "hoje".
 */

const { extractDatesFromText, formatBr } = require('./dateUtils');
const { getPhase1Meta } = require('./phase1ToolCatalog');
const { assertCanUseTool } = require('./permissions');

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function historyBlob(history) {
  if (!Array.isArray(history)) return '';
  return history
    .slice(-8)
    .map((m) => `${m.role || ''}: ${m.content || m.text || ''}`)
    .join('\n');
}

function wantsReservationCount(text) {
  const t = normalize(text);
  if (!t) return false;
  if (/\b(bloquear|liberar|fechar)\b.{0,30}\b(dia|agenda)\b/.test(t)) return false;
  if (
    /\b(quantas?|qts?|qtd|quantidade|numero|número|contagem|total)\b/.test(t) &&
    /\breserv/.test(t)
  ) {
    return true;
  }
  if (/\breserv/.test(t) && /\b(por dia|cada dia|nesses dias|nesses dias|para os dias)\b/.test(t)) {
    return true;
  }
  if (/\breserv/.test(t) && /\b(final de semana|fim de semana|fds)\b/.test(t)) {
    return true;
  }
  if (/\breserv/.test(t) && /\b(do dia|ate o dia|até o dia|de \d{1,2} ate|de \d{1,2} até)\b/.test(t)) {
    return true;
  }
  return false;
}

/**
 * @param {object} pool
 * @param {{ user: object, estId: number, text: string, history?: object[] }} opts
 */
async function tryReservationCountTurn(pool, { user, estId, text, history }) {
  const blob = `${historyBlob(history)}\n${text}`;
  if (!wantsReservationCount(text) && !wantsReservationCount(blob)) {
    // Continuidade: usuário só mandou datas / "ok" depois de pedir contagem
    const histWants = wantsReservationCount(historyBlob(history));
    const datesOnly =
      extractDatesFromText(text).length > 0 &&
      !/\b(bloquear|criar|pausar|os)\b/i.test(text);
    const continueOk = /^(ok|certo|sim|pode|continua|continue|e ai|e aí)\b/i.test(
      String(text || '').trim()
    );
    if (!(histWants && (datesOnly || continueOk))) return null;
  }

  let dates = extractDatesFromText(text);
  if (!dates.length) dates = extractDatesFromText(blob);
  if (!dates.length) return null;
  if (dates.length > 14) dates = dates.slice(0, 14);

  await assertCanUseTool(pool, {
    user,
    establishmentId: estId,
    toolName: 'buscar_reservas',
  });

  const lines = [];
  const days = [];
  for (const date of dates) {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n,
              COALESCE(SUM(number_of_people),0)::int AS people
         FROM restaurant_reservations
        WHERE establishment_id = $1
          AND reservation_date = $2
          AND COALESCE(UPPER(status::text), '') NOT IN ('CANCELADA','CANCELLED','CANCELED')`,
      [estId, date]
    );
    const n = rows[0]?.n || 0;
    const people = rows[0]?.people || 0;
    days.push({ date, count: n, people });
    lines.push(
      n
        ? `${formatBr(date)}: ${n} reserva(s) (${people} pessoa(s))`
        : `${formatBr(date)}: nenhuma reserva`
    );
  }

  const total = days.reduce((s, d) => s + d.count, 0);
  const reply =
    days.length === 1
      ? lines[0] + '.'
      : `Segue a contagem:\n${lines.join('\n')}\nTotal no período: ${total} reserva(s).`;

  return {
    ok: true,
    type: 'result',
    reply,
    tool: 'buscar_reservas',
    data: { days, total },
    meta: getPhase1Meta(),
  };
}

module.exports = {
  tryReservationCountTurn,
  wantsReservationCount,
  extractDatesFromText,
};

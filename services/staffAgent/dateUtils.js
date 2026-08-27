'use strict';

/** Datas do Staff Agent sempre no fuso da operação (America/Sao_Paulo). */

function todayIsoSp() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function parseDateOrToday(date) {
  const raw = String(date || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return todayIsoSp();
}

module.exports = { todayIsoSp, parseDateOrToday };

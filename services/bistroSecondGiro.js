'use strict';

/**
 * 2º giro (Bistrô) — Seu Justino e Pracinha.
 *
 * Espera antecipada só faz sentido quando o 1º giro já ocupa mesas.
 * Dia vazio (ou só outras esperas) não deve ir para fila.
 *
 * Pracinha não abre almoço no sábado (abre 18:00). O corte de 15:00 do
 * Justino não se aplica: no sábado da Pracinha o 2º giro começa às 21:00.
 */

const SECOND_GIRO_PROFILES = new Set(['seu_justino', 'pracinha']);

function toMinutes(timeStr) {
  const t = String(timeStr || '').slice(0, 5);
  const [hh, mm] = t.split(':').map(Number);
  if (Number.isNaN(hh)) return null;
  let minutes = hh * 60 + (Number.isNaN(mm) ? 0 : mm);
  // Madrugada (ex.: 01:00) continua o giro do dia operacional.
  if (minutes < 6 * 60) minutes += 24 * 60;
  return minutes;
}

function weekdayFromDate(dateStr) {
  const raw = String(dateStr || '').trim();
  const day = raw.includes('T') ? raw.split('T')[0] : raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.getDay();
}

function isBistroProfile(profile) {
  return SECOND_GIRO_PROFILES.has(String(profile || ''));
}

/**
 * @param {{ date: string, time: string, profile?: string }} args
 */
function isSecondGiroBistro({ date, time, profile }) {
  if (!isBistroProfile(profile)) return false;
  const weekday = weekdayFromDate(date);
  const minutes = toMinutes(time);
  if (weekday == null || minutes == null) return false;

  // Pracinha sábado: sem almoço; 1º giro 18:00–21:00, 2º giro após 21:00.
  if (profile === 'pracinha' && weekday === 6) {
    return minutes >= 21 * 60;
  }

  // Terça (2) a Sexta (5): após 21:00
  if (weekday >= 2 && weekday <= 5) return minutes >= 21 * 60;
  // Sábado Justino / Domingo: após 15:00
  if (weekday === 6 || weekday === 0) return minutes >= 15 * 60;
  return false;
}

/**
 * Só força espera antecipada no 2º giro se já houver ocupação real no dia.
 * @param {{ isSecondGiro: boolean, occupyingCount?: number, capacityFull?: boolean }} args
 */
function shouldForceEsperaAntecipada({
  isSecondGiro,
  occupyingCount = 0,
  capacityFull = false,
}) {
  if (!isSecondGiro) return false;
  const occupied = Number(occupyingCount) > 0;
  return occupied || capacityFull === true;
}

function notesIndicateEsperaAntecipada(notes) {
  return String(notes || '').toUpperCase().includes('ESPERA ANTECIPADA');
}

function extractLinkedReservationId(notes) {
  const match = String(notes || '').match(
    /Reserva de Espera Antecipada \(ID:\s*(\d+)\)/i,
  );
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function withEsperaAntecipadaNotes(notes) {
  const current = String(notes || '').trim();
  if (notesIndicateEsperaAntecipada(current)) return current;
  return current
    ? `${current} | ESPERA ANTECIPADA (Bistrô)`
    : 'ESPERA ANTECIPADA (Bistrô)';
}

function stripEsperaAntecipadaNotes(notes) {
  const cleaned = String(notes || '')
    .replace(/\s*\|\s*ESPERA ANTECIPADA(?:\s*\(Bistrô\))?/gi, '')
    .replace(/ESPERA ANTECIPADA(?:\s*\(Bistrô\))?/gi, '')
    .replace(/\s*\|\s*$/, '')
    .replace(/^\s*\|\s*/, '')
    .trim();
  return cleaned || null;
}

module.exports = {
  isBistroProfile,
  isSecondGiroBistro,
  shouldForceEsperaAntecipada,
  notesIndicateEsperaAntecipada,
  extractLinkedReservationId,
  withEsperaAntecipadaNotes,
  stripEsperaAntecipadaNotes,
};

'use strict';

/**
 * Realtime dos bloqueios de agenda via Socket.IO (mesma instância do server.js).
 * Room: agenda_est_{establishmentId}
 * Evento: reservation_block_changed
 *
 * Usado pelo Staff Agent e pelas rotas /api/restaurant-reservation-blocks,
 * para o calendário do admin refletir bloqueios sem F5.
 */

let ioRef = null;

function attachAgendaRealtime(io) {
  ioRef = io || null;
}

/**
 * @param {{ establishmentId: number, action: 'created'|'updated'|'deleted',
 *           blockIds?: number[], date?: string|null, reason?: string|null }} params
 */
function emitReservationBlockChanged({
  establishmentId,
  action,
  blockIds = [],
  date = null,
  reason = null,
}) {
  if (!ioRef) return;
  const estId = Number(establishmentId);
  if (!Number.isFinite(estId) || estId <= 0) return;

  const payload = {
    establishment_id: estId,
    action,
    block_ids: blockIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)),
    date: date || null,
    reason: reason || null,
    at: new Date().toISOString(),
  };

  try {
    ioRef.to(`agenda_est_${estId}`).emit('reservation_block_changed', payload);
  } catch (e) {
    console.warn('[agendaRealtime] emit falhou:', e.message);
  }
}

module.exports = {
  attachAgendaRealtime,
  emitReservationBlockChanged,
};

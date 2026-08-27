'use strict';

/**
 * Realtime das OS / detalhes operacionais via Socket.IO (mesma instância do server.js).
 * Room: os_est_{establishmentId}
 * Evento: operational_detail_changed
 *
 * Emitido pelo Staff Agent e pelas rotas /api/v1/operational-details,
 * para a tela de Detalhes Operacionais refletir mudanças sem F5.
 */

let ioRef = null;

function attachOsRealtime(io) {
  ioRef = io || null;
}

/**
 * @param {{ establishmentId: number|null, action: 'created'|'updated'|'deleted',
 *           detailId?: number|null, osType?: string|null, date?: string|null,
 *           projectName?: string|null }} params
 */
function emitOperationalDetailChanged({
  establishmentId,
  action,
  detailId = null,
  osType = null,
  date = null,
  projectName = null,
}) {
  if (!ioRef) return;
  const estId = Number(establishmentId);
  if (!Number.isFinite(estId) || estId <= 0) return;

  const payload = {
    establishment_id: estId,
    action,
    detail_id: detailId != null ? Number(detailId) : null,
    os_type: osType || null,
    date: date ? String(date).slice(0, 10) : null,
    project_name: projectName || null,
    at: new Date().toISOString(),
  };

  try {
    ioRef.to(`os_est_${estId}`).emit('operational_detail_changed', payload);
  } catch (e) {
    console.warn('[osRealtime] emit falhou:', e.message);
  }
}

module.exports = {
  attachOsRealtime,
  emitOperationalDetailChanged,
};

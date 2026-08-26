'use strict';

/**
 * Realtime do cardápio via Socket.IO (mesma instância do server.js).
 * Rooms: cardapio_bar_{barId} | cardapio_est_{establishmentId}
 * Evento: menu_item_visibility
 */

let ioRef = null;

function attachMenuRealtime(io) {
  ioRef = io || null;
}

function emitMenuItemVisibilityChanged({
  barId,
  establishmentId = null,
  itemId,
  name = null,
  visible,
}) {
  if (!ioRef) return;
  const payload = {
    bar_id: Number(barId) || null,
    establishment_id: establishmentId != null ? Number(establishmentId) : null,
    item_id: Number(itemId),
    name: name || null,
    visible: Boolean(visible),
    at: new Date().toISOString(),
  };
  if (!Number.isFinite(payload.item_id) || payload.item_id <= 0) return;
  try {
    if (payload.bar_id) {
      ioRef.to(`cardapio_bar_${payload.bar_id}`).emit('menu_item_visibility', payload);
    }
    if (payload.establishment_id) {
      ioRef.to(`cardapio_est_${payload.establishment_id}`).emit('menu_item_visibility', payload);
    }
  } catch (e) {
    console.warn('[menuRealtime] emit falhou:', e.message);
  }
}

module.exports = {
  attachMenuRealtime,
  emitMenuItemVisibilityChanged,
};

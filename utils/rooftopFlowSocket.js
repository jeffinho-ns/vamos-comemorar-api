/**
 * Helper para emitir evento Socket.io quando um check-in afeta a fila do Fluxo Rooftop.
 * A página /admin/checkins/rooftop-fluxo entra na sala rooftop_flow_{establishment_id}_{flow_date}
 * e ao receber rooftop_queue_refresh refaz a busca e atualiza a lista em tempo real.
 */

const ROOM_PREFIX = 'rooftop_flow_';

/**
 * Retorna { establishment_id, flow_date } a partir de um guest_list_id (guest_lists -> restaurant_reservations ou large_reservations).
 * flow_date em YYYY-MM-DD. Retorna null se não encontrar.
 */
async function getRooftopFlowRoomFromGuestList(pool, guestListId) {
  if (!pool || !guestListId) return null;
  try {
    const result = await pool.query(
      `SELECT gl.id, gl.reservation_id, gl.reservation_type,
              COALESCE(rr.establishment_id, lr.establishment_id) AS establishment_id,
              COALESCE(rr.reservation_date::TEXT, lr.reservation_date::TEXT) AS reservation_date
       FROM guest_lists gl
       LEFT JOIN restaurant_reservations rr ON gl.reservation_id = rr.id AND gl.reservation_type = 'restaurant'
       LEFT JOIN large_reservations lr ON gl.reservation_id = lr.id AND gl.reservation_type = 'large'
       WHERE gl.id = $1`,
      [guestListId]
    );
    const row = result.rows[0];
    if (!row || row.establishment_id == null) return null;
    const flowDate = row.reservation_date ? String(row.reservation_date).split('T')[0] : null;
    if (!flowDate || !/^\d{4}-\d{2}-\d{2}$/.test(flowDate)) return null;
    return { establishment_id: Number(row.establishment_id), flow_date: flowDate };
  } catch (e) {
    console.warn('[rooftopFlowSocket] getRooftopFlowRoomFromGuestList:', e.message);
    return null;
  }
}

/**
 * Retorna { establishment_id, flow_date } a partir de uma reservation (restaurant_reservations).
 */
async function getRooftopFlowRoomFromReservation(pool, reservationId) {
  if (!pool || !reservationId) return null;
  try {
    const result = await pool.query(
      `SELECT establishment_id, reservation_date FROM restaurant_reservations WHERE id = $1`,
      [reservationId]
    );
    const row = result.rows[0];
    if (!row || row.establishment_id == null) return null;
    const flowDate = row.reservation_date ? String(row.reservation_date).split('T')[0] : null;
    if (!flowDate || !/^\d{4}-\d{2}-\d{2}$/.test(flowDate)) return null;
    return { establishment_id: Number(row.establishment_id), flow_date: flowDate };
  } catch (e) {
    console.warn('[rooftopFlowSocket] getRooftopFlowRoomFromReservation:', e.message);
    return null;
  }
}

function getRoomName(establishmentId, flowDate) {
  return `${ROOM_PREFIX}${establishmentId}_${flowDate}`;
}

/**
 * Emite rooftop_queue_refresh para a sala do estabelecimento + data.
 * Chamar após qualquer check-in que afete a fila (reserva, dono, convidado).
 */
function emitRooftopQueueRefresh(io, establishmentId, flowDate) {
  if (!io || establishmentId == null || !flowDate) return;
  const room = getRoomName(establishmentId, flowDate);
  io.to(room).emit('rooftop_queue_refresh', {});
  console.log(`📡 [Socket] rooftop_queue_refresh emitido para sala ${room}`);
}

module.exports = {
  getRooftopFlowRoomFromGuestList,
  getRooftopFlowRoomFromReservation,
  emitRooftopQueueRefresh,
  getRoomName,
};

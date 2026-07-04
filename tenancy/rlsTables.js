'use strict';

/**
 * Tabelas com RLS tenant (migrations 008, 014, 016, 017).
 * poolRlsWrap aplica set_config quando SAAS_RLS_MODE=on e a query toca alguma delas.
 */

const RLS_SCOPED_TABLES = [
  'restaurant_reservations',
  'guest_lists',
  'guests',
  'waitlist',
  'walk_ins',
  'large_reservations',
  'birthday_reservations',
  'restaurant_reservation_blocks',
  'reservas',
  'reservas_camarote',
  'promoters',
  'promoter_eventos',
  'promoter_convidados',
];

const RLS_TABLE_PATTERNS = RLS_SCOPED_TABLES.map(
  (name) => new RegExp(`\\b${name}\\b`, 'i'),
);

function targetsRlsScopedTable(sql) {
  const text = String(sql || '');
  return RLS_TABLE_PATTERNS.some((re) => re.test(text));
}

/** @deprecated use targetsRlsScopedTable */
function targetsRestaurantReservations(sql) {
  return targetsRlsScopedTable(sql);
}

module.exports = {
  RLS_SCOPED_TABLES,
  targetsRlsScopedTable,
  targetsRestaurantReservations,
};

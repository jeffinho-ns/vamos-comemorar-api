'use strict';

const LARGE_STATUS = {
  NOVA: 'NOVA',
  PENDING: 'NOVA',
  PENDENTE: 'NOVA',
  CONFIRMADA: 'CONFIRMADA',
  CONFIRMED: 'CONFIRMADA',
  CANCELADA: 'CANCELADA',
  CANCELLED: 'CANCELADA',
  CANCELED: 'CANCELADA',
  CHECKED_IN: 'CHECKED_IN',
  CHECKEDIN: 'CHECKED_IN',
  SEATED: 'CHECKED_IN',
  COMPLETED: 'COMPLETED',
  CONCLUIDA: 'COMPLETED',
  CONCLUÍDA: 'COMPLETED',
  FINALIZADA: 'COMPLETED',
  NO_SHOW: 'CANCELADA',
  NOSHOW: 'CANCELADA',
};

const LARGE_ORIGIN = {
  CLIENTE: 'CLIENTE',
  CLIENT: 'CLIENTE',
  SITE: 'CLIENTE',
  WIDGET: 'CLIENTE',
  TELEFONE: 'CLIENTE',
  ADMIN: 'ADMIN',
  PESSOAL: 'ADMIN',
  OUTRO: 'ADMIN',
};

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-\s]/g, '_');
}

function normalizeLargeReservationStatus(status, fallback = 'NOVA') {
  if (status == null || String(status).trim() === '') return fallback;
  return LARGE_STATUS[normalizeKey(status)] || fallback;
}

function normalizeLargeReservationOrigin(origin, fallback = 'CLIENTE') {
  if (origin == null || String(origin).trim() === '') return fallback;
  return LARGE_ORIGIN[normalizeKey(origin)] || fallback;
}

function tablesPayloadFromTableNumber(tableNumber) {
  if (tableNumber == null || String(tableNumber).trim() === '') return null;
  const tables = String(tableNumber)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && s.toLowerCase() !== 'null');
  return tables.length > 0 ? tables : null;
}

module.exports = {
  normalizeLargeReservationStatus,
  normalizeLargeReservationOrigin,
  tablesPayloadFromTableNumber,
};

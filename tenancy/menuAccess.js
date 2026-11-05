'use strict';

const ALLOWED_MENU_KEYS = Object.freeze([
  'checkins',
  'qrcode',
  'restaurant-reservations',
  'workdays',
  'eventos',
  'painel-eventos',
  'detalhes-operacionais',
  'cardapio',
  'atendimento',
  'justino360',
  'bi-justino',
  'rh-ideia',
  'users',
  'enterprise',
  'gifts',
  'guia',
  'logs',
]);

const BLOCKED_MENU_KEYS = Object.freeze(['reservas', 'equipe', 'superadmin']);

const ALLOWED_MENU_KEY_SET = new Set(ALLOWED_MENU_KEYS);

const MENU_TO_LEGACY_FLAGS = Object.freeze({
  checkins: ['can_manage_checkins'],
  'restaurant-reservations': ['can_manage_reservations', 'can_create_edit_reservations'],
  cardapio: ['can_view_cardapio', 'can_create_cardapio', 'can_edit_cardapio'],
  atendimento: ['can_manage_whatsapp'],
  justino360: ['can_access_justino360'],
  'rh-ideia': ['can_access_rh_ideia'],
  'detalhes-operacionais': ['can_view_operational_detail'],
});

const MENU_TO_RBAC = Object.freeze({
  atendimento: ['whatsapp:read', 'whatsapp:update'],
  cardapio: ['cardapio:read', 'cardapio:update'],
  checkins: ['checkin:read', 'checkin:update'],
  'restaurant-reservations': ['reservas:read', 'reservas:create', 'reservas:update', 'reservas:delete'],
  eventos: ['eventos:read', 'eventos:update'],
  'painel-eventos': ['eventos:read', 'eventos:update'],
  'detalhes-operacionais': ['eventos:read', 'eventos:update'],
  justino360: ['justino360:read'],
  'rh-ideia': ['rh_ideia:read'],
  logs: ['relatorios:read'],
});

function parseMenuAccessInput(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

function sanitizeMenuAccess(arr) {
  const seen = new Set();
  const out = [];
  for (const raw of parseMenuAccessInput(arr)) {
    const key = String(raw || '').trim();
    if (!key || BLOCKED_MENU_KEYS.includes(key)) continue;
    if (!ALLOWED_MENU_KEY_SET.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function deriveLegacyFlagsFromMenuAccess(arr) {
  const selected = new Set(sanitizeMenuAccess(arr));
  const flags = {};
  for (const [menuKey, flagNames] of Object.entries(MENU_TO_LEGACY_FLAGS)) {
    const on = selected.has(menuKey);
    for (const flag of flagNames) {
      flags[flag] = on;
    }
  }
  return flags;
}

function applyDerivedMenuFlags(baseFlags, menuAccessInput) {
  const provided = menuAccessInput !== undefined;
  const menuAccess = provided ? sanitizeMenuAccess(menuAccessInput) : undefined;
  if (!provided) return { flags: { ...baseFlags }, menuAccess: undefined };
  return {
    flags: { ...baseFlags, ...deriveLegacyFlagsFromMenuAccess(menuAccess) },
    menuAccess,
  };
}

function grantRbacFromMenuAccess(perms, row) {
  const keys = sanitizeMenuAccess(row && row.menu_access);
  for (const key of keys) {
    const grants = MENU_TO_RBAC[key];
    if (!grants) continue;
    for (const grant of grants) perms.add(grant);
  }
}

function unionMenuAccess(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    for (const key of sanitizeMenuAccess(row && row.menu_access)) {
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

function canAccessBiJustinoFromUep(row) {
  return sanitizeMenuAccess(row && row.menu_access).includes('bi-justino');
}

module.exports = {
  ALLOWED_MENU_KEYS,
  BLOCKED_MENU_KEYS,
  sanitizeMenuAccess,
  deriveLegacyFlagsFromMenuAccess,
  applyDerivedMenuFlags,
  grantRbacFromMenuAccess,
  unionMenuAccess,
  canAccessBiJustinoFromUep,
};

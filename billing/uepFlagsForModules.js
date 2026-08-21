'use strict';

const MODULE_UEP_FIELDS = {
  reservas: [
    'can_manage_reservations',
    'can_create_edit_reservations',
    'can_view_operational_detail',
    'can_create_operational_detail',
    'can_edit_operational_detail',
  ],
  checkin: ['can_manage_checkins'],
  cardapio: [
    'can_view_cardapio',
    'can_create_cardapio',
    'can_edit_cardapio',
    'can_delete_cardapio',
  ],
  whatsapp: ['can_manage_whatsapp', 'can_configure_ia'],
  eventos: ['can_view_os', 'can_download_os', 'can_create_os', 'can_edit_os'],
  relatorios: ['can_view_reports'],
  promoters: [],
  justino360: [
    'can_access_justino360',
    'can_manage_justino360',
    'can_validate_justino360',
  ],
};

const ALL_UEP_FIELDS = [
  ...new Set(Object.values(MODULE_UEP_FIELDS).flat()),
];

function emptyUepFlags() {
  const flags = { is_active: true };
  for (const field of ALL_UEP_FIELDS) flags[field] = false;
  return flags;
}

function uepFlagsForModules(moduleKeys) {
  const flags = emptyUepFlags();
  const keys = Array.isArray(moduleKeys) ? moduleKeys.map(String) : [];
  for (const key of keys) {
    const fields = MODULE_UEP_FIELDS[key] || [];
    for (const field of fields) flags[field] = true;
  }
  return flags;
}

module.exports = {
  MODULE_UEP_FIELDS,
  uepFlagsForModules,
  emptyUepFlags,
};

'use strict';

/**
 * Traduz flags de user_establishment_permissions para chaves RBAC modulo:acao.
 * Usado para unificar UEP legado com memberships SaaS.
 */

function mergeUepRowIntoPermissionSet(perms, row) {
  const manageRes = !!row.can_manage_reservations;
  const createEditRes = row.can_create_edit_reservations !== false;
  const manageWhatsapp = !!row.can_manage_whatsapp || manageRes;
  const configureIa = !!row.can_configure_ia;
  const manageCheckin = !!row.can_manage_checkins;
  const viewCardapio = !!row.can_view_cardapio;
  const editCardapio =
    !!row.can_create_cardapio || !!row.can_edit_cardapio || !!row.can_delete_cardapio;
  const viewReports = !!row.can_view_reports;
  const viewEventos =
    !!row.can_view_os ||
    !!row.can_view_operational_detail ||
    !!row.can_create_os ||
    !!row.can_edit_os;

  if (manageRes) {
    perms.add('reservas:read');
    if (createEditRes) {
      perms.add('reservas:create');
      perms.add('reservas:update');
      perms.add('reservas:delete');
    }
  }

  if (manageCheckin) {
    perms.add('checkin:read');
    perms.add('checkin:update');
  }

  if (manageWhatsapp || configureIa) {
    perms.add('whatsapp:read');
    perms.add('whatsapp:update');
  }

  if (viewCardapio) {
    perms.add('cardapio:read');
  }
  if (editCardapio) {
    perms.add('cardapio:update');
  }

  if (viewEventos) {
    perms.add('eventos:read');
    perms.add('eventos:update');
  }

  if (viewReports) {
    perms.add('relatorios:read');
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} userId
 * @returns {Promise<string[]>}
 */
async function loadUepRbacPermissions(pool, userId) {
  if (!userId) return [];
  try {
    const { rows } = await pool.query(
      `SELECT
         can_manage_reservations,
         can_create_edit_reservations,
         can_manage_checkins,
         can_manage_whatsapp,
         can_configure_ia,
         can_view_cardapio,
         can_create_cardapio,
         can_edit_cardapio,
         can_delete_cardapio,
         can_view_reports,
         can_view_os,
         can_create_os,
         can_edit_os,
         can_view_operational_detail,
         can_create_operational_detail,
         can_edit_operational_detail
         FROM user_establishment_permissions
        WHERE user_id = $1 AND is_active = TRUE`,
      [userId],
    );
    if (!rows.length) return [];
    const perms = new Set();
    for (const row of rows) {
      mergeUepRowIntoPermissionSet(perms, row);
    }
    return [...perms];
  } catch (_) {
    return [];
  }
}

module.exports = {
  loadUepRbacPermissions,
  mergeUepRowIntoPermissionSet,
};

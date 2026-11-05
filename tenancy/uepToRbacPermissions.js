'use strict';

/**
 * Traduz flags de user_establishment_permissions para chaves RBAC modulo:acao.
 * Usado para unificar UEP legado com memberships SaaS.
 */

const {
  grantRbacFromMenuAccess,
  unionMenuAccess,
} = require('./menuAccess');

function mergeUepRowIntoPermissionSet(perms, row) {
  const manageRes = !!row.can_manage_reservations;
  const createEditRes = row.can_create_edit_reservations !== false;
  const manageWhatsapp = !!row.can_manage_whatsapp || manageRes;
  const configureIa = !!row.can_configure_ia;
  const manageCheckin = !!row.can_manage_checkins;
  // Alinhado ao front (can_view_cardapio !== false): NULL/undefined = liberado (DEFAULT TRUE legado).
  const viewCardapio = row.can_view_cardapio !== false;
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

  if (row.can_access_justino360 || row.can_manage_justino360 || row.can_validate_justino360) {
    perms.add('justino360:read');
  }
  if (row.can_manage_justino360 || row.can_validate_justino360) {
    perms.add('justino360:update');
  }

  if (row.can_access_rh_ideia || row.can_manage_rh_ideia || row.can_validate_rh_ideia) {
    perms.add('rh_ideia:read');
  }
  if (row.can_manage_rh_ideia || row.can_validate_rh_ideia) {
    perms.add('rh_ideia:update');
  }

  grantRbacFromMenuAccess(perms, row);
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} userId
 * @returns {Promise<{ permissions: string[], menuAccess: string[] }>}
 */
async function loadUepRbacAndMenuAccess(pool, userId) {
  if (!userId) return { permissions: [], menuAccess: [] };

  const coreSelect = `
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
         can_edit_operational_detail,
         can_access_justino360,
         can_manage_justino360,
         can_validate_justino360`;

  const rhSelect = `,
         can_access_rh_ideia,
         can_manage_rh_ideia,
         can_validate_rh_ideia`;

  const menuSelect = `,
         menu_access`;

  const foldRows = (rows) => {
    if (!rows.length) return { permissions: [], menuAccess: [] };
    const perms = new Set();
    for (const row of rows) {
      mergeUepRowIntoPermissionSet(perms, row);
    }
    return { permissions: [...perms], menuAccess: unionMenuAccess(rows) };
  };

  const run = async ({ withRh, withMenu }) => {
    const { rows } = await pool.query(
      `SELECT ${coreSelect}${withRh ? rhSelect : ''}${withMenu ? menuSelect : ''}
         FROM user_establishment_permissions
        WHERE user_id = $1 AND is_active = TRUE`,
      [userId],
    );
    return foldRows(rows);
  };

  const missingCol = (err) => {
    const msg = String(err && err.message ? err.message : err || '');
    return {
      rh: /column ["']?can_access_rh_ideia["']? does not exist|column ["']?can_manage_rh_ideia["']? does not exist|column ["']?can_validate_rh_ideia["']? does not exist/i.test(msg),
      menu: /column ["']?menu_access["']? does not exist/i.test(msg),
    };
  };

  try {
    return await run({ withRh: true, withMenu: true });
  } catch (err) {
    const miss = missingCol(err);
    if (!miss.rh && !miss.menu) {
      console.error('[uepToRbacPermissions] falha ao carregar UEP:', {
        userId,
        message: err.message || err,
      });
      return { permissions: [], menuAccess: [] };
    }
    try {
      return await run({ withRh: !miss.rh, withMenu: !miss.menu });
    } catch (err2) {
      try {
        return await run({ withRh: false, withMenu: false });
      } catch (err3) {
        console.error('[uepToRbacPermissions] falha ao carregar UEP (sem extras):', {
          userId,
          message: err3.message || err3,
        });
        return { permissions: [], menuAccess: [] };
      }
    }
  }
}

async function loadUepRbacPermissions(pool, userId) {
  const { permissions } = await loadUepRbacAndMenuAccess(pool, userId);
  return permissions;
}

module.exports = {
  loadUepRbacPermissions,
  loadUepRbacAndMenuAccess,
  mergeUepRowIntoPermissionSet,
};

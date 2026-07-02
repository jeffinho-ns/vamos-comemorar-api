'use strict';

/**
 * Backfill memberships a partir de user_establishment_permissions (UEP).
 *
 * DRY-RUN por padrão. Para aplicar:
 *   SAAS_BACKFILL_CONFIRM=apply node scripts/saas/backfill_memberships_from_uep.js
 */

const pool = require('../../config/database');

async function main() {
  const apply = String(process.env.SAAS_BACKFILL_CONFIRM || '').toLowerCase() === 'apply';

  const preview = await pool.query(
    `SELECT u.id AS user_id, u.email, e.organization_id, est.id AS establishment_id,
            COALESCE(
              CASE LOWER(u.role::text)
                WHEN 'admin' THEN 'account_admin'
                WHEN 'administrador' THEN 'account_admin'
                WHEN 'gerente' THEN 'gerente_bar'
                WHEN 'recepcao' THEN 'recepcao'
                WHEN 'recepção' THEN 'recepcao'
                WHEN 'atendente' THEN 'recepcao'
                ELSE 'gerente_bar'
              END,
              'gerente_bar'
            ) AS role_key
       FROM user_establishment_permissions uep
       JOIN users u ON u.id = uep.user_id
       JOIN meu_backup_db.establishments e
         ON e.legacy_place_id = uep.establishment_id OR e.legacy_bar_id = uep.establishment_id
       JOIN meu_backup_db.establishments est ON est.id = e.id
      WHERE uep.is_active = TRUE
        AND COALESCE(u.is_super_admin, FALSE) = FALSE
        AND NOT EXISTS (
          SELECT 1 FROM meu_backup_db.memberships m
           WHERE m.user_id = u.id
             AND m.organization_id = e.organization_id
             AND m.establishment_id IS NOT DISTINCT FROM est.id
        )`,
  );

  console.log(`Memberships a criar: ${preview.rows.length}`);
  preview.rows.slice(0, 20).forEach((r) => {
    console.log(`  + ${r.email} org=${r.organization_id} est=${r.establishment_id} role=${r.role_key}`);
  });
  if (preview.rows.length > 20) {
    console.log(`  ... e mais ${preview.rows.length - 20}`);
  }

  if (!apply) {
    console.log('\nDRY-RUN. Para aplicar: SAAS_BACKFILL_CONFIRM=apply node scripts/saas/backfill_memberships_from_uep.js');
    await pool.end();
    return;
  }

  const result = await pool.query(
    `INSERT INTO meu_backup_db.memberships (user_id, organization_id, establishment_id, role_id, is_active)
     SELECT DISTINCT u.id,
            e.organization_id,
            est.id,
            r.id,
            TRUE
       FROM user_establishment_permissions uep
       JOIN users u ON u.id = uep.user_id
       JOIN meu_backup_db.establishments e
         ON e.legacy_place_id = uep.establishment_id OR e.legacy_bar_id = uep.establishment_id
       JOIN meu_backup_db.establishments est ON est.id = e.id
       JOIN meu_backup_db.roles r
         ON r.organization_id = e.organization_id
        AND r.key = COALESCE(
              CASE LOWER(u.role::text)
                WHEN 'admin' THEN 'account_admin'
                WHEN 'administrador' THEN 'account_admin'
                WHEN 'gerente' THEN 'gerente_bar'
                WHEN 'recepcao' THEN 'recepcao'
                WHEN 'recepção' THEN 'recepcao'
                WHEN 'atendente' THEN 'recepcao'
                ELSE 'gerente_bar'
              END,
              'gerente_bar'
            )
      WHERE uep.is_active = TRUE
        AND COALESCE(u.is_super_admin, FALSE) = FALSE
     ON CONFLICT (user_id, organization_id, establishment_id) DO NOTHING`,
  );

  console.log(`\nInseridos: ${result.rowCount}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

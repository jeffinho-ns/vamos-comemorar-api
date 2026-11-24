'use strict';

/**
 * Corrige FAQs com organization_id NULL (ou desalinhado da casa).
 * Sem isso, contas da casa (não super admin) só veem parte das
 * "Informações adicionais" por causa do RLS por organização.
 *
 * Uso: node scripts/saas/fix_establishment_faq_organization_id.js
 */

const pool = require('../../config/database');

async function main() {
  await pool.query(`SELECT set_config('app.bypass_rls', 'on', false)`);

  const before = await pool.query(`
    SELECT establishment_id, organization_id, count(*)::int AS n
      FROM establishment_faq
     GROUP BY 1, 2
     ORDER BY 1, 2 NULLS FIRST
  `);
  console.log('Antes:', before.rows);

  const updated = await pool.query(`
    UPDATE establishment_faq ef
       SET organization_id = est.organization_id
      FROM establishments est
     WHERE est.organization_id IS NOT NULL
       AND est.legacy_place_id = ef.establishment_id
       AND ef.organization_id IS DISTINCT FROM est.organization_id
     RETURNING ef.id
  `);
  console.log(`Atualizadas via establishments.legacy_place_id: ${updated.rowCount}`);

  const after = await pool.query(`
    SELECT establishment_id, organization_id, count(*)::int AS n
      FROM establishment_faq
     WHERE establishment_id IN (1, 8)
     GROUP BY 1, 2
     ORDER BY 1, 2 NULLS FIRST
  `);
  console.log('Justino/Pracinha depois:', after.rows);

  const remainingNull = await pool.query(`
    SELECT count(*)::int AS n FROM establishment_faq WHERE organization_id IS NULL
  `);
  console.log('Ainda NULL no total:', remainingNull.rows[0]?.n);
}

main()
  .catch((err) => {
    console.error('Falha:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

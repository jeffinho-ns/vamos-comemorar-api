'use strict';

/**
 * Corrige promoters órfãos (role=promoter sem linha em promoters e sem UEP).
 *
 * Estratégia:
 * 1) Se existir promoter ativo com mesmo e-mail → vincula user_id
 * 2) Senão, com SAAS_FIX_CONFIRM=apply → role vira 'cliente' (não bloqueia SaaS)
 *
 * DRY-RUN por padrão.
 */

const pool = require('../../config/database');

async function main() {
  const apply = String(process.env.SAAS_FIX_CONFIRM || '').toLowerCase() === 'apply';

  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.name, u.role::text AS role
       FROM users u
      WHERE u.role::text = 'promoter'
        AND NOT EXISTS (SELECT 1 FROM promoters p WHERE p.user_id = u.id)
        AND NOT EXISTS (
          SELECT 1 FROM user_establishment_permissions uep
           WHERE uep.user_id = u.id AND uep.is_active = TRUE
        )
        AND u.email NOT LIKE 'analista@%'
      ORDER BY u.email`,
  );

  if (!rows.length) {
    console.log('Nenhum promoter órfão encontrado.');
    await pool.end();
    return;
  }

  console.log(`Promoters órfãos: ${rows.length}\n`);

  let linked = 0;
  let downgraded = 0;

  for (const user of rows) {
    const promo = await pool.query(
      `SELECT promoter_id, nome FROM promoters
        WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) AND ativo = TRUE
        LIMIT 1`,
      [user.email],
    );

    if (promo.rows.length) {
      console.log(`LINK ${user.email} → promoter_id ${promo.rows[0].promoter_id}`);
      if (apply) {
        await pool.query(`UPDATE promoters SET user_id = $1 WHERE promoter_id = $2`, [
          user.id,
          promo.rows[0].promoter_id,
        ]);
        linked += 1;
      }
      continue;
    }

    console.log(`DOWNGRADE ${user.email} (sem registro em promoters)`);
    if (apply) {
      await pool.query(`UPDATE users SET role = 'cliente' WHERE id = $1`, [user.id]);
      downgraded += 1;
    }
  }

  console.log(`\nResumo: ${linked} vinculados, ${downgraded} rebaixados para cliente.`);
  if (!apply) {
    console.log('DRY-RUN. Para aplicar: SAAS_FIX_CONFIRM=apply node scripts/saas/fix_promoter_orphans.js');
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

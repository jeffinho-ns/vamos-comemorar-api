/**
 * Corrige permissões órfãs com establishment_id = 3 (não existe place 3).
 * O HighLine real é o place 7. Estratégia segura:
 *  - Se o usuário NÃO tem permissão para 7: troca 3 -> 7.
 *  - Se já tem (evita duplicar user+establishment): desativa a órfã (soft delete).
 * Uso: node scripts/fix_orphan_establishment_3.js
 */
require('dotenv').config();
const pool = require('../config/database');

async function main() {
  const orphans = await pool.query(
    `SELECT id, user_id, user_email, is_active
       FROM user_establishment_permissions
      WHERE establishment_id = 3`
  );
  console.log(`Órfãs com establishment_id=3: ${orphans.rows.length}`);

  for (const row of orphans.rows) {
    const existing7 = await pool.query(
      `SELECT id FROM user_establishment_permissions
        WHERE user_id = $1 AND establishment_id = 7`,
      [row.user_id]
    );
    if (existing7.rows.length > 0) {
      await pool.query(
        `UPDATE user_establishment_permissions
            SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [row.id]
      );
      console.log(`  perm ${row.id} (user ${row.user_id} ${row.user_email}): já tinha 7 -> órfã desativada`);
    } else {
      await pool.query(
        `UPDATE user_establishment_permissions
            SET establishment_id = 7, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [row.id]
      );
      console.log(`  perm ${row.id} (user ${row.user_id} ${row.user_email}): establishment_id 3 -> 7`);
    }
  }

  console.log('Concluído.');
}

main()
  .catch((e) => {
    console.error('Erro:', e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

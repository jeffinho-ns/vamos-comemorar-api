/**
 * Script: Configurar permissões do analista do Seu Justino
 * Usuário: analista@seujustino.com
 * Escopo: apenas estabelecimento Seu Justino (places.id = 1)
 */

require('dotenv').config();
const { Pool } = require('pg');

async function main() {
  const targetEmail = 'analista@seujustino.com';
  const establishmentId = 1; // Seu Justino (places.id)

  const connectionString =
    process.env.DATABASE_URL ||
    'postgresql://agilizaidb_user:9leBZwUgynZN5pnHPsqEJDW1tkE6LWjZ@dpg-d4bmh07diees73db68cg-a.oregon-postgres.render.com/agilizaidb?sslmode=prefer';

  const pool = new Pool({
    connectionString,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userRes = await client.query(
      'SELECT id, email FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1',
      [targetEmail],
    );
    if (userRes.rows.length === 0) {
      throw new Error(`Usuário não encontrado: ${targetEmail}`);
    }
    const userId = userRes.rows[0].id;

    // Garantir colunas de cardápio (se já migradas)
    await client.query(
      `
      DO $$
      BEGIN
        BEGIN
          ALTER TABLE user_establishment_permissions
            ADD COLUMN IF NOT EXISTS can_view_cardapio BOOLEAN DEFAULT TRUE,
            ADD COLUMN IF NOT EXISTS can_create_cardapio BOOLEAN DEFAULT TRUE,
            ADD COLUMN IF NOT EXISTS can_edit_cardapio BOOLEAN DEFAULT TRUE,
            ADD COLUMN IF NOT EXISTS can_delete_cardapio BOOLEAN DEFAULT TRUE;
        EXCEPTION WHEN others THEN
          -- ignora erro se já existem / ambiente diferente
          NULL;
        END;
      END;
      $$;
      `,
    );

    // Upsert permissões completas para o Seu Justino
    await client.query(
      `
      INSERT INTO user_establishment_permissions (
        user_id, user_email, establishment_id,
        can_edit_os, can_edit_operational_detail,
        can_view_os, can_download_os, can_view_operational_detail,
        can_create_os, can_create_operational_detail,
        can_manage_reservations, can_manage_checkins, can_view_reports,
        can_create_edit_reservations,
        can_view_cardapio, can_create_cardapio, can_edit_cardapio, can_delete_cardapio,
        is_active
      )
      VALUES (
        $1, $2, $3,
        TRUE, TRUE,
        TRUE, TRUE, TRUE,
        TRUE, TRUE,
        TRUE, TRUE, TRUE,
        TRUE,
        TRUE, TRUE, TRUE, TRUE,
        TRUE
      )
      ON CONFLICT (user_id, establishment_id)
      DO UPDATE SET
        user_email = EXCLUDED.user_email,
        can_edit_os = TRUE,
        can_edit_operational_detail = TRUE,
        can_view_os = TRUE,
        can_download_os = TRUE,
        can_view_operational_detail = TRUE,
        can_create_os = TRUE,
        can_create_operational_detail = TRUE,
        can_manage_reservations = TRUE,
        can_manage_checkins = TRUE,
        can_view_reports = TRUE,
        can_create_edit_reservations = TRUE,
        can_view_cardapio = TRUE,
        can_create_cardapio = TRUE,
        can_edit_cardapio = TRUE,
        can_delete_cardapio = TRUE,
        is_active = TRUE,
        updated_at = CURRENT_TIMESTAMP;
      `,
      [userId, targetEmail, establishmentId],
    );

    // Desativar permissões em outros estabelecimentos, se existirem
    await client.query(
      `
      UPDATE user_establishment_permissions
      SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND establishment_id <> $2;
      `,
      [userId, establishmentId],
    );

    await client.query('COMMIT');
    console.log('✅ Permissões configuradas para analista@seujustino.com no Seu Justino (establishment_id=1)');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Falha ao configurar permissões:', e.message || e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
}

main();


/**
 * Script: Setar permissões de Cardápio para diego.dbk@gmail.com (somente Reserva Rooftop)
 *
 * Uso:
 *   node scripts/setDiegoReservaRooftopCardapioPermissions.js
 *
 * Requisitos:
 * - Variáveis de ambiente do banco configuradas (mesmas do server.js)
 * - Usuário diego.dbk@gmail.com existente na tabela users
 * - Establishment (places) do Reserva Rooftop com id=9
 */

require('dotenv').config();
const { Pool } = require('pg');

async function main() {
  const targetEmail = 'diego.dbk@gmail.com';
  const establishmentId = 9; // Reserva Rooftop (places.id)

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

    const cols = await client.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'user_establishment_permissions'
         AND column_name IN ('can_view_cardapio','can_create_cardapio','can_edit_cardapio','can_delete_cardapio')`,
    );
    const colNames = cols.rows.map((r) => r.column_name);
    const missing = ['can_view_cardapio','can_create_cardapio','can_edit_cardapio','can_delete_cardapio'].filter(
      (c) => !colNames.includes(c),
    );
    if (missing.length > 0) {
      throw new Error(
        `Colunas de cardápio não encontradas em user_establishment_permissions: ${missing.join(', ')}. ` +
          `Rode a migration add_cardapio_permissions_to_establishment_permissions_postgresql.sql`,
      );
    }

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
        FALSE, FALSE,
        FALSE, FALSE, FALSE,
        FALSE, FALSE,
        FALSE, FALSE, FALSE,
        FALSE,
        TRUE, TRUE, TRUE, TRUE,
        TRUE
      )
      ON CONFLICT (user_id, establishment_id)
      DO UPDATE SET
        user_email = EXCLUDED.user_email,
        can_view_cardapio = TRUE,
        can_create_cardapio = TRUE,
        can_edit_cardapio = TRUE,
        can_delete_cardapio = TRUE,
        is_active = TRUE,
        updated_at = CURRENT_TIMESTAMP
      `,
      [userId, targetEmail, establishmentId],
    );

    await client.query('COMMIT');
    console.log('✅ Permissões de Cardápio configuradas com sucesso:', {
      email: targetEmail,
      establishment_id: establishmentId,
    });
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


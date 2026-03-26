/**
 * Cria/atualiza o usuário vinicius.gomes@ideiaum.com.br
 * com acesso somente ao cardápio em todos os estabelecimentos.
 *
 * Uso:
 *   node scripts/createViniciusCardapioAllEstablishments.js
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../config/database');

const TARGET_EMAIL = 'vinicius.gomes@ideiaum.com.br';
const TARGET_NAME = 'Vinicius Gomes';
const TARGET_ROLE = 'gerente';
const DEFAULT_PASSWORD = 'Cardapio@2026';
const DEFAULT_CPF = '00000000999';

async function getTableSchema(client, tableName) {
  const result = await client.query(
    `
    SELECT table_schema
    FROM information_schema.tables
    WHERE table_name = $1
      AND table_schema IN ('meu_backup_db', 'public')
    ORDER BY CASE WHEN table_schema = 'meu_backup_db' THEN 0 ELSE 1 END
    LIMIT 1
    `,
    [tableName]
  );

  if (result.rows.length === 0) {
    throw new Error(`Tabela não encontrada: ${tableName}`);
  }

  return result.rows[0].table_schema;
}

async function ensureUser(client) {
  const existingUserResult = await client.query(
    'SELECT id, email, cpf FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1',
    [TARGET_EMAIL]
  );

  const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  if (existingUserResult.rows.length > 0) {
    const user = existingUserResult.rows[0];
    const cpfToUse = user.cpf || DEFAULT_CPF;

    await client.query(
      `UPDATE users
       SET name = $1,
           role = $2,
           password = $3,
           cpf = $4
       WHERE id = $5`,
      [TARGET_NAME, TARGET_ROLE, hashedPassword, cpfToUse, user.id]
    );

    console.log(`✅ Usuário atualizado: ${TARGET_EMAIL} (id ${user.id})`);
    return user.id;
  }

  const insertResult = await client.query(
    `INSERT INTO users (name, email, password, role, cpf)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [TARGET_NAME, TARGET_EMAIL, hashedPassword, TARGET_ROLE, DEFAULT_CPF]
  );

  const userId = insertResult.rows[0].id;
  console.log(`✅ Usuário criado: ${TARGET_EMAIL} (id ${userId})`);
  return userId;
}

async function validateCardapioColumns(client, permissionsSchema) {
  const cols = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = $1
       AND table_name = 'user_establishment_permissions'
       AND column_name IN ('can_view_cardapio','can_create_cardapio','can_edit_cardapio','can_delete_cardapio')`,
    [permissionsSchema]
  );

  const colNames = cols.rows.map((r) => r.column_name);
  const required = [
    'can_view_cardapio',
    'can_create_cardapio',
    'can_edit_cardapio',
    'can_delete_cardapio',
  ];
  const missing = required.filter((c) => !colNames.includes(c));

  if (missing.length > 0) {
    throw new Error(
      `Colunas de cardápio ausentes em user_establishment_permissions: ${missing.join(', ')}. ` +
      'Rode a migration add_cardapio_permissions_to_establishment_permissions_postgresql.sql'
    );
  }
}

async function upsertPermissionsForAllEstablishments(client, userId, permissionsSchema, placesSchema) {
  const establishmentsResult = await client.query(
    `SELECT id, name FROM ${placesSchema}.places ORDER BY id`
  );

  if (establishmentsResult.rows.length === 0) {
    throw new Error('Nenhum estabelecimento encontrado na tabela places.');
  }

  for (const establishment of establishmentsResult.rows) {
    await client.query(
      `
      INSERT INTO ${permissionsSchema}.user_establishment_permissions (
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
        can_edit_os = FALSE,
        can_edit_operational_detail = FALSE,
        can_view_os = FALSE,
        can_download_os = FALSE,
        can_view_operational_detail = FALSE,
        can_create_os = FALSE,
        can_create_operational_detail = FALSE,
        can_manage_reservations = FALSE,
        can_manage_checkins = FALSE,
        can_view_reports = FALSE,
        can_create_edit_reservations = FALSE,
        can_view_cardapio = TRUE,
        can_create_cardapio = TRUE,
        can_edit_cardapio = TRUE,
        can_delete_cardapio = TRUE,
        is_active = TRUE,
        updated_at = CURRENT_TIMESTAMP
      `,
      [userId, TARGET_EMAIL, establishment.id]
    );

    console.log(
      `   Permissões de cardápio aplicadas em ${establishment.name || 'Sem nome'} (id ${establishment.id})`
    );
  }
}

async function run() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const permissionsSchema = await getTableSchema(client, 'user_establishment_permissions');
    const placesSchema = await getTableSchema(client, 'places');
    await validateCardapioColumns(client, permissionsSchema);
    const userId = await ensureUser(client);
    await upsertPermissionsForAllEstablishments(client, userId, permissionsSchema, placesSchema);

    await client.query('COMMIT');
    console.log('\n🎉 Concluído com sucesso.');
    console.log(`Email: ${TARGET_EMAIL}`);
    console.log(`Senha padrão: ${DEFAULT_PASSWORD}`);
    console.log('Escopo: apenas cardápio (visualizar/criar/editar/excluir) em todos os estabelecimentos.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erro ao configurar usuário/permissões:', error.message || error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
}

run();

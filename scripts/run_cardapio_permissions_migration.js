// Script para executar migração de permissões de Cardápio por estabelecimento (PostgreSQL)
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  let pool;

  try {
    const connectionString =
      process.env.DATABASE_URL ||
      'postgresql://agilizaidb_user:9leBZwUgynZN5pnHPsqEJDW1tkE6LWjZ@dpg-d4bmh07diees73db68cg-a.oregon-postgres.render.com/agilizaidb?sslmode=prefer';

    pool = new Pool({
      connectionString,
      ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
    });

    console.log('🔗 Conectando ao banco de dados...');
    await pool.query('SELECT NOW()');
    console.log('✅ Conectado ao banco de dados');

    const migrationPath = path.join(
      __dirname,
      '../migrations/add_cardapio_permissions_to_establishment_permissions_postgresql.sql',
    );
    console.log('📖 Lendo arquivo de migração:', migrationPath);

    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Arquivo de migração não encontrado: ${migrationPath}`);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('🚀 Executando migração...');
    await pool.query(migrationSQL);
    console.log('✅ Migração executada com sucesso!');

    const cols = await pool.query(
      `
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_establishment_permissions'
        AND column_name IN (
          'can_view_cardapio',
          'can_create_cardapio',
          'can_edit_cardapio',
          'can_delete_cardapio'
        )
      ORDER BY column_name
      `,
    );

    console.log('🔍 Colunas de Cardápio encontradas:', cols.rows);
  } catch (error) {
    console.error('\n❌ Erro ao executar migração:', error.message);
    console.error('Stack:', error.stack);
    process.exitCode = 1;
  } finally {
    if (pool) {
      await pool.end();
      console.log('\n🔌 Conexão com banco fechada');
    }
  }
}

runMigration();


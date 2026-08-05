// Executa migração: preferred_area_id e preferred_table_number na waitlist
const { Pool } = require('pg');
const { requireDatabaseUrl } = require('../config/resolveDatabaseUrl');

async function runMigration() {
  let pool;
  try {
    const connectionString = requireDatabaseUrl();
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes('render.com') ? { rejectUnauthorized: false } : undefined,
    });

    console.log('🔗 Conectando ao banco de dados...');
    await pool.query('SELECT NOW()');
    console.log('✅ Conectado com sucesso!');

    console.log('📝 Adicionando campo preferred_area_id na tabela waitlist...');
    await pool.query(`
      ALTER TABLE waitlist
      ADD COLUMN IF NOT EXISTS preferred_area_id INTEGER
    `);
    console.log('✅ Campo preferred_area_id adicionado');

    console.log('📝 Adicionando campo preferred_table_number na tabela waitlist...');
    await pool.query(`
      ALTER TABLE waitlist
      ADD COLUMN IF NOT EXISTS preferred_table_number VARCHAR(50)
    `);
    console.log('✅ Campo preferred_table_number adicionado');

    console.log('📝 Criando índice idx_waitlist_area...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_waitlist_area ON waitlist(preferred_area_id)
    `);
    console.log('✅ Índice idx_waitlist_area criado');

    console.log('📝 Criando índice idx_waitlist_table...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_waitlist_table ON waitlist(preferred_table_number)
    `);
    console.log('✅ Índice idx_waitlist_table criado');

    console.log('🔍 Verificando se os campos foram criados...');
    const checkResult = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'waitlist'
      AND column_name IN ('preferred_area_id', 'preferred_table_number')
    `);

    checkResult.rows.forEach(row => {
      console.log(`✅ Campo ${row.column_name} encontrado`);
      console.log(`   Tipo: ${row.data_type}, Nullable: ${row.is_nullable}`);
    });

    console.log('\n✅ Migração add_waitlist_area_table_fields concluída com sucesso!');
  } catch (err) {
    console.error('❌ Erro na migração:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    if (pool) {
      console.log('\n🔌 Conexão com o banco de dados encerrada.');
      await pool.end();
    }
  }
}

runMigration();

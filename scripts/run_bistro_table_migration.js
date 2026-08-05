// Executa migração: has_bistro_table nas tabelas waitlist e restaurant_reservations
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
    console.log('✅ Conectado com sucesso!\n');

    console.log('📝 Adicionando campo has_bistro_table na tabela waitlist...');
    await pool.query(`
      ALTER TABLE waitlist
      ADD COLUMN IF NOT EXISTS has_bistro_table BOOLEAN DEFAULT FALSE
    `);
    console.log('✅ Campo adicionado na tabela waitlist');

    console.log('📝 Adicionando campo has_bistro_table na tabela restaurant_reservations...');
    await pool.query(`
      ALTER TABLE restaurant_reservations
      ADD COLUMN IF NOT EXISTS has_bistro_table BOOLEAN DEFAULT FALSE
    `);
    console.log('✅ Campo adicionado na tabela restaurant_reservations');

    console.log('📝 Criando índice idx_waitlist_bistro...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_waitlist_bistro ON waitlist(has_bistro_table)
    `);
    console.log('✅ Índice criado para waitlist');

    console.log('📝 Criando índice idx_reservations_bistro...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_reservations_bistro ON restaurant_reservations(has_bistro_table)
    `);
    console.log('✅ Índice criado para restaurant_reservations');

    // Verificar se os campos foram criados
    console.log('\n🔍 Verificando se os campos foram criados...');
    const waitlistCheck = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'waitlist' AND column_name = 'has_bistro_table'
    `);
    
    const reservationsCheck = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'restaurant_reservations' AND column_name = 'has_bistro_table'
    `);

    if (waitlistCheck.rows.length > 0) {
      console.log('✅ Campo has_bistro_table encontrado na tabela waitlist');
      console.log(`   Tipo: ${waitlistCheck.rows[0].data_type}, Default: ${waitlistCheck.rows[0].column_default}`);
    } else {
      console.log('⚠️ Campo has_bistro_table NÃO encontrado na tabela waitlist');
    }

    if (reservationsCheck.rows.length > 0) {
      console.log('✅ Campo has_bistro_table encontrado na tabela restaurant_reservations');
      console.log(`   Tipo: ${reservationsCheck.rows[0].data_type}, Default: ${reservationsCheck.rows[0].column_default}`);
    } else {
      console.log('⚠️ Campo has_bistro_table NÃO encontrado na tabela restaurant_reservations');
    }

    console.log('\n✅ Migração add_bistro_table_fields concluída com sucesso!');
  } catch (err) {
    console.error('❌ Erro ao executar migração:', err.message);
    console.error('Stack:', err.stack);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
      console.log('\n🔌 Conexão com o banco de dados encerrada.');
    }
  }
}

runMigration();

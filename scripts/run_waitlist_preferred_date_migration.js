// Executa migração: preferred_date na waitlist
const { Pool } = require('pg');

async function runMigration() {
  let pool;
  try {
    const connectionString = process.env.DATABASE_URL ||
      'postgresql://agilizaidb_user:9leBZwUgynZN5pnHPsqEJDW1tkE6LWjZ@dpg-d4bmh07diees73db68cg-a.oregon-postgres.render.com/agilizaidb?sslmode=prefer';
    pool = new Pool({
      connectionString,
      ssl: !!process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
    });

    console.log('🔗 Conectando ao banco...');
    await pool.query('SELECT NOW()');
    console.log('✅ Conectado');

    console.log('📝 ADD COLUMN preferred_date...');
    await pool.query(`
      ALTER TABLE waitlist
      ADD COLUMN IF NOT EXISTS preferred_date DATE
    `);

    console.log('📝 CREATE INDEX idx_waitlist_estab_date_status...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_waitlist_estab_date_status
      ON waitlist (establishment_id, preferred_date, status)
    `);

    console.log('✅ Migração 2026-01-23_add_waitlist_preferred_date concluída.');
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  } finally {
    if (pool) await pool.end();
  }
}

runMigration();

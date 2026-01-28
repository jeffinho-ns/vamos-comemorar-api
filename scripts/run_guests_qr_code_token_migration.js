// Executa migração: qr_code_token e is_owner na tabela guests (PostgreSQL)
require('dotenv').config();
const pool = require('../config/database');

async function runMigration() {
  try {
    console.log('🔗 Conectando ao banco de dados...');
    await pool.query('SELECT NOW()');
    console.log('✅ Conectado com sucesso!\n');

    console.log('📝 Adicionando coluna qr_code_token em guests...');
    await pool.query('ALTER TABLE guests ADD COLUMN IF NOT EXISTS qr_code_token VARCHAR(64)');
    console.log('✅ Coluna qr_code_token ok');

    console.log('📝 Adicionando coluna is_owner em guests...');
    await pool.query('ALTER TABLE guests ADD COLUMN IF NOT EXISTS is_owner BOOLEAN DEFAULT FALSE');
    console.log('✅ Coluna is_owner ok');

    console.log('📝 Criando índice idx_guests_qr_code_token...');
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_guests_qr_code_token ON guests(qr_code_token) WHERE qr_code_token IS NOT NULL');
    console.log('✅ Índice idx_guests_qr_code_token ok');

    console.log('📝 Criando índice idx_guests_is_owner...');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_guests_is_owner ON guests(is_owner)');
    console.log('✅ Índice idx_guests_is_owner ok');

    console.log('\n✅ Migração add_guests_qr_code_token concluída com sucesso!');
  } catch (err) {
    console.error('❌ Erro ao executar migração:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('\n🔌 Conexão encerrada.');
  }
}

runMigration();

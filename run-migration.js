// Script para executar a migração SQL
const mysql = require('mysql2/promise');
const fs = require('fs');

async function runMigration() {
  const connection = await mysql.createConnection({
    host: '193.203.175.55',
    user: 'u621081794_vamos',
    password: '@123Mudar!@',
    database: 'u621081794_vamos'
  });

  try {
    console.log('🔗 Conectando ao banco de dados...');
    
    // Ler o arquivo de migração
    const migrationSQL = fs.readFileSync('./migrations/create_guest_lists_and_guests.sql', 'utf8');
    
    console.log('📝 Executando migração...');
    
    // Executar a migração
    await connection.execute(migrationSQL);
    
    console.log('✅ Migração executada com sucesso!');
    console.log('📋 Tabelas criadas:');
    console.log('   - guest_lists');
    console.log('   - guests');
    
  } catch (error) {
    console.error('❌ Erro ao executar migração:', error.message);
  } finally {
    await connection.end();
    console.log('🔐 Conexão encerrada.');
  }
}

runMigration();

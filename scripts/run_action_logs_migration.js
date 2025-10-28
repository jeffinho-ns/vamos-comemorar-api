// Script para executar a migração de logs de ações
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

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
    const migrationPath = path.join(__dirname, '../migrations/create_action_logs_table.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📝 Executando migração de logs de ações...');
    
    // Executar a migração
    await connection.execute(migrationSQL);
    
    console.log('✅ Migração executada com sucesso!');
    console.log('📋 Tabela criada:');
    console.log('   - action_logs');
    console.log('\n📊 Estrutura da tabela:');
    console.log('   - id (INT, AUTO_INCREMENT, PRIMARY KEY)');
    console.log('   - user_id (INT, NOT NULL)');
    console.log('   - user_name (VARCHAR(255))');
    console.log('   - user_email (VARCHAR(255))');
    console.log('   - user_role (VARCHAR(50))');
    console.log('   - action_type (VARCHAR(100))');
    console.log('   - action_description (TEXT)');
    console.log('   - resource_type (VARCHAR(100))');
    console.log('   - resource_id (INT)');
    console.log('   - establishment_id (INT)');
    console.log('   - establishment_name (VARCHAR(255))');
    console.log('   - ip_address (VARCHAR(45))');
    console.log('   - user_agent (TEXT)');
    console.log('   - request_method (VARCHAR(10))');
    console.log('   - request_url (TEXT)');
    console.log('   - status (VARCHAR(50))');
    console.log('   - additional_data (JSON)');
    console.log('   - created_at (TIMESTAMP)');
    console.log('\n✨ Sistema de logs pronto para uso!');
    
  } catch (error) {
    console.error('❌ Erro ao executar migração:', error.message);
    console.error('Detalhes:', error);
  } finally {
    await connection.end();
    console.log('🔐 Conexão encerrada.');
  }
}

runMigration();









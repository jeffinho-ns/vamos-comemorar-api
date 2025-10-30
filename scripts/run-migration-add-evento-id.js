/**
 * Script para executar migração: Adicionar evento_id às reservas
 * 
 * Execute: node scripts/run-migration-add-evento-id.js
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  let connection;
  
  try {
    // Configuração de conexão do banco de dados
    const dbConfig = {
      host: process.env.DB_HOST || '193.203.175.55',
      user: process.env.DB_USER || 'u621081794_vamos',
      password: process.env.DB_PASSWORD || '@123Mudar!@',
      database: process.env.DB_NAME || 'u621081794_vamos',
      multipleStatements: true
    };

    console.log('🔌 Conectando ao banco de dados...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conectado com sucesso!');

    // Ler arquivo de migração
    const migrationPath = path.join(__dirname, '../migrations/add_evento_id_to_reservations.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('\n📝 Executando migração: Adicionar evento_id às reservas...\n');

    // Executar migração
    await connection.query(migrationSQL);

    console.log('✅ Migração executada com sucesso!');
    console.log('\n📊 Verificando resultados...');

    // Verificar se as colunas foram adicionadas
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME = 'restaurant_reservations' 
      AND COLUMN_NAME = 'evento_id'
    `, [dbConfig.database]);

    if (columns.length > 0) {
      console.log('✅ Coluna evento_id adicionada à tabela restaurant_reservations');
    } else {
      console.log('⚠️  Coluna evento_id não encontrada na tabela restaurant_reservations');
    }

    const [largeColumns] = await connection.query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME = 'large_reservations' 
      AND COLUMN_NAME = 'evento_id'
    `, [dbConfig.database]);

    if (largeColumns.length > 0) {
      console.log('✅ Coluna evento_id adicionada à tabela large_reservations');
    } else {
      console.log('⚠️  Coluna evento_id não encontrada na tabela large_reservations');
    }

    console.log('\n🎉 Migração concluída com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro ao executar migração:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Conexão encerrada.');
    }
  }
}

// Executar migração
runMigration();


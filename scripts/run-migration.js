// scripts/run-migration.js

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  let connection;
  
  try {
    // Configuração do banco de dados
    const dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'u621081794_vamos',
      multipleStatements: true
    };

    console.log('🔗 Conectando ao banco de dados...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conectado ao banco de dados');

    // Ler o arquivo de migração
    const migrationPath = path.join(__dirname, '../migrations/create_large_reservations_table.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📝 Executando migração...');
    await connection.execute(migrationSQL);
    console.log('✅ Migração executada com sucesso!');

    // Verificar se a tabela foi criada
    const [tables] = await connection.execute("SHOW TABLES LIKE 'large_reservations'");
    if (tables.length > 0) {
      console.log('✅ Tabela large_reservations criada com sucesso!');
      
      // Mostrar estrutura da tabela
      const [structure] = await connection.execute("DESCRIBE large_reservations");
      console.log('\n📋 Estrutura da tabela:');
      console.table(structure);
    } else {
      console.log('❌ Erro: Tabela large_reservations não foi criada');
    }

  } catch (error) {
    console.error('❌ Erro ao executar migração:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Conexão com banco fechada');
    }
  }
}

// Executar migração
runMigration();

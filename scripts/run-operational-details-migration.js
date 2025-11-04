// scripts/run-operational-details-migration.js
// Script para executar a migração da tabela operational_details

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  let connection;
  
  try {
    // Configuração do banco de dados (usando as mesmas credenciais do config/database.js)
    const dbConfig = {
      host: '193.203.175.55',
      user: 'u621081794_vamos',
      password: '@123Mudar!@',
      database: 'u621081794_vamos',
      multipleStatements: true
    };

    console.log('🔗 Conectando ao banco de dados...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conectado ao banco de dados');

    // Ler o arquivo de migração
    const migrationPath = path.join(__dirname, '../migrations/create_operational_details_table.sql');
    console.log('📖 Lendo arquivo de migração:', migrationPath);
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('✅ Arquivo lido com sucesso!');

    console.log('📝 Executando migração...');
    
    // Executar o SQL diretamente (já está formatado corretamente)
    try {
      await connection.query(migrationSQL);
      console.log('  ✅ SQL executado com sucesso');
    } catch (error) {
      // Se a tabela já existe, isso é OK
      if (error.code === 'ER_TABLE_EXISTS_ERROR' || error.message.includes('already exists') || error.message.includes('Duplicate')) {
        console.log('  ⚠️  Tabela já existe (isso é OK)');
      } else {
        console.error('  ❌ Erro ao executar SQL:', error.message);
        if (error.code) {
          console.error('     Código:', error.code);
        }
        throw error;
      }
    }
    
    console.log('✅ Migração executada com sucesso!');

    // Verificar se a tabela foi criada
    console.log('\n🔍 Verificando se a tabela foi criada...');
    const [tables] = await connection.execute("SHOW TABLES LIKE 'operational_details'");
    
    if (tables.length > 0) {
      console.log('✅ Tabela operational_details criada/verificada com sucesso!');
      
      // Mostrar estrutura da tabela
      const [structure] = await connection.execute("DESCRIBE operational_details");
      console.log('\n📋 Estrutura da tabela:');
      console.table(structure);
      
      // Contar índices
      const [indexes] = await connection.execute("SHOW INDEXES FROM operational_details");
      console.log(`\n📊 Total de índices: ${indexes.length}`);
      
    } else {
      console.log('❌ Erro: Tabela operational_details não foi criada');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Erro ao executar migração:', error);
    if (error.code) {
      console.error('   Código do erro:', error.code);
    }
    if (error.sqlMessage) {
      console.error('   Mensagem SQL:', error.sqlMessage);
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Conexão com banco fechada');
    }
  }
}

// Executar migração
runMigration();


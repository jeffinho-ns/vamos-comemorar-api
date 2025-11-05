const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Configuração do banco de dados
const dbConfig = {
  host: '193.203.175.55',
  user: 'u621081794_vamos',
  password: '@123Mudar!@',
  database: 'u621081794_vamos'
};

async function runMigration() {
  let connection;
  
  try {
    console.log('🔗 Conectando ao banco de dados...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conectado com sucesso!');
    
    // Ler o arquivo de migração
    const migrationPath = path.join(__dirname, '..', 'migrations', 'add_os_type_fields.sql');
    console.log('📖 Lendo arquivo de migração:', migrationPath);
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('📝 Arquivo lido com sucesso!');
    
    // Executar a migração - dividir em comandos separados
    console.log('🚀 Executando migração...');
    
    // Separar ALTER TABLE e CREATE INDEX
    const alterTableMatch = migrationSQL.match(/ALTER TABLE[\s\S]*?;/) || [];
    const createIndexMatch = migrationSQL.match(/CREATE INDEX[\s\S]*?;/g) || [];
    
    // Executar ALTER TABLE primeiro
    if (alterTableMatch.length > 0) {
      console.log('📝 Executando ALTER TABLE...');
      try {
        const alterTableSQL = alterTableMatch[0];
        await connection.execute(alterTableSQL);
        console.log('  ✅ ALTER TABLE executado com sucesso!');
      } catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME' || error.message.includes('Duplicate column name')) {
          console.log('  ⚠️  Algumas colunas já existem, continuando...');
        } else {
          console.error('  ❌ Erro no ALTER TABLE:', error.message);
          throw error;
        }
      }
    }
    
    // Executar CREATE INDEX depois
    if (createIndexMatch.length > 0) {
      console.log(`📝 Executando ${createIndexMatch.length} CREATE INDEX...`);
      for (let i = 0; i < createIndexMatch.length; i++) {
        const indexSQL = createIndexMatch[i];
        try {
          await connection.execute(indexSQL);
          console.log(`  ✅ Índice ${i + 1} criado com sucesso!`);
        } catch (error) {
          if (error.code === 'ER_DUP_KEYNAME' || error.message.includes('Duplicate key name')) {
            console.log(`  ⚠️  Índice ${i + 1} já existe, pulando...`);
          } else {
            console.error(`  ❌ Erro ao criar índice ${i + 1}:`, error.message);
            // Não lançar erro, apenas avisar
          }
        }
      }
    }
    
    console.log('✅ Migração executada!');
    
    // Verificar se as colunas foram criadas
    console.log('🔍 Verificando colunas criadas...');
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'u621081794_vamos' 
      AND TABLE_NAME = 'operational_details'
      AND COLUMN_NAME IN ('os_type', 'os_number', 'contractor_name', 'provider_name')
    `);
    
    console.log(`📦 Colunas verificadas: ${columns.length} encontradas`);
    
    if (columns.length >= 4) {
      console.log('✅ Migração concluída com sucesso!');
    } else {
      console.log('⚠️  Algumas colunas podem não ter sido criadas');
    }
    
  } catch (error) {
    console.error('❌ Erro ao executar migração:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Conexão encerrada');
    }
  }
}

runMigration();


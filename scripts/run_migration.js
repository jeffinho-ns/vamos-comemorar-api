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
    const migrationPath = path.join(__dirname, '..', 'migrations', 'create_camarotes_tables.sql');
    console.log('📖 Lendo arquivo de migração:', migrationPath);
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('📝 Arquivo lido com sucesso!');
    
    // Executar a migração - dividir em comandos separados
    console.log('🚀 Executando migração...');
    
    // Dividir o SQL em comandos individuais
    const commands = migrationSQL
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));
    
    console.log(`📝 Executando ${commands.length} comandos SQL...`);
    
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      if (command.trim()) {
        console.log(`  ${i + 1}/${commands.length}: ${command.substring(0, 50)}...`);
        try {
          await connection.execute(command + ';');
        } catch (error) {
          console.error(`❌ Erro no comando ${i + 1}:`, error.message);
          // Continuar com os próximos comandos mesmo se um falhar
        }
      }
    }
    
    console.log('✅ Migração executada!');
    
    // Verificar se as tabelas foram criadas
    console.log('🔍 Verificando tabelas criadas...');
    const [tables] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = 'u621081794_vamos' 
      AND TABLE_NAME IN ('camarotes', 'reservas_camarote', 'camarote_convidados')
      ORDER BY TABLE_NAME
    `);
    
    console.log('📋 Tabelas criadas:');
    tables.forEach(table => {
      console.log(`  - ${table.TABLE_NAME}`);
    });
    
    // Verificar camarotes inseridos
    const [camarotes] = await connection.execute('SELECT COUNT(*) as total FROM camarotes');
    console.log(`📊 Total de camarotes inseridos: ${camarotes[0].total}`);
    
  } catch (error) {
    console.error('❌ Erro ao executar migração:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔗 Conexão encerrada');
    }
  }
}

runMigration();

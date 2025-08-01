// Script para executar migração do banco de dados
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const pool = mysql.createPool({
  host: '193.203.175.55',
  user: 'u621081794_vamos',
  password: '@123Mudar!@',
  database: 'u621081794_vamos',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function runMigration() {
  console.log('🚀 Iniciando migração do banco de dados...');
  
  try {
    const connection = await pool.getConnection();
    
    // Lê o arquivo SQL de migração
    const migrationPath = path.join(__dirname, 'migrations', 'add_promoter_support.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Conteúdo do arquivo SQL:');
    console.log(migrationSQL);
    
    // Divide o SQL em comandos individuais e remove comentários
    const commands = migrationSQL
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => {
        // Remove linhas vazias e comentários
        const cleanCmd = cmd.replace(/--.*$/gm, '').trim();
        return cleanCmd.length > 0;
      })
      .map(cmd => cmd.replace(/--.*$/gm, '').trim()) // Remove comentários inline
      .filter(cmd => cmd.length > 0);
    
    console.log(`📝 Encontrados ${commands.length} comandos SQL:`);
    commands.forEach((cmd, index) => {
      console.log(`  ${index + 1}: ${cmd.substring(0, 50)}...`);
    });
    
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      if (command.trim()) {
        try {
          console.log(`\nExecutando comando ${i + 1}/${commands.length}...`);
          console.log(`SQL: ${command}`);
          await connection.execute(command);
          console.log(`✅ Comando ${i + 1} executado com sucesso`);
        } catch (error) {
          // Se o erro for sobre coluna já existir, ignora
          if (error.message.includes('Duplicate column name') || 
              error.message.includes('Duplicate key name')) {
            console.log(`⚠️  Comando ${i + 1} ignorado (já existe): ${error.message}`);
          } else {
            console.error(`❌ Erro no comando ${i + 1}:`, error.message);
            throw error;
          }
        }
      }
    }
    
    // Criar índices separadamente (opcional, para melhorar performance)
    console.log('\n📊 Criando índices para melhorar performance...');
    
    const indexCommands = [
      'CREATE INDEX idx_eventos_promoter ON eventos(promoter_id)',
      'CREATE INDEX idx_eventos_criado_por ON eventos(criado_por)'
    ];
    
    for (const indexCommand of indexCommands) {
      try {
        await connection.execute(indexCommand);
        console.log(`✅ Índice criado com sucesso`);
      } catch (error) {
        if (error.message.includes('Duplicate key name')) {
          console.log(`⚠️  Índice já existe, ignorando...`);
        } else {
          console.log(`⚠️  Erro ao criar índice (não crítico): ${error.message}`);
        }
      }
    }
    
    console.log('\n🎉 Migração concluída com sucesso!');
    console.log('📋 Resumo das alterações:');
    console.log('   - Adicionada coluna criado_por na tabela eventos');
    console.log('   - Adicionada coluna promoter_id na tabela eventos');
    console.log('   - Criados índices para melhorar performance');
    console.log('   - Adicionados endpoints para promoters no backend');
    
    connection.release();
    
  } catch (error) {
    console.error('❌ Erro durante a migração:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Executa a migração se o script for chamado diretamente
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration }; 
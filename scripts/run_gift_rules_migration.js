// Script para executar a migração do sistema de brindes
// Execute: node scripts/run_gift_rules_migration.js

const pool = require('../config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('🚀 Iniciando migração do sistema de brindes...\n');
  
  try {
    // Ler o arquivo SQL
    const migrationPath = path.join(__dirname, '../migrations/create_gift_rules_system_postgresql.sql');
    console.log('📄 Lendo arquivo de migração:', migrationPath);
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('✅ Arquivo lido com sucesso\n');
    
    // Dividir o SQL em comandos individuais (separados por ;)
    // PostgreSQL não permite múltiplos comandos em uma query, então vamos executar um por um
    const commands = migrationSQL
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0 && !cmd.startsWith('--') && cmd !== '\n');
    
    console.log(`📝 Executando ${commands.length} comandos SQL...\n`);
    
    let executed = 0;
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      
      // Pular comentários e comandos vazios
      if (command.length < 10 || command.startsWith('--')) {
        continue;
      }
      
      try {
        console.log(`⏳ Executando comando ${i + 1}/${commands.length}...`);
        await pool.query(command + ';');
        executed++;
        console.log(`✅ Comando ${i + 1} executado com sucesso\n`);
      } catch (cmdError) {
        // Ignorar erros de "já existe" (CREATE TABLE IF NOT EXISTS, etc)
        if (cmdError.code === '42P07' || cmdError.message.includes('already exists')) {
          console.log(`⚠️  Comando ${i + 1} - já existe (ignorando)\n`);
        } else {
          console.error(`❌ Erro no comando ${i + 1}:`, cmdError.message);
          // Continuar mesmo com erro para tentar criar o que for possível
        }
      }
    }
    
    console.log(`\n✅ Migração concluída! ${executed} comandos executados.`);
    console.log('\n📋 Próximos passos:');
    console.log('   1. Verifique se as tabelas foram criadas');
    console.log('   2. Teste criar uma regra de brinde na interface');
    console.log('   3. Faça check-ins e veja os brindes sendo liberados\n');
    
    // Verificar se as tabelas foram criadas
    try {
      const checkResult = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name IN ('gift_rules', 'guest_list_gifts')
      `);
      
      console.log(`🔍 Tabelas encontradas: ${checkResult.rows.length}/2`);
      checkResult.rows.forEach(row => {
        console.log(`   ✅ ${row.table_name}`);
      });
      
      if (checkResult.rows.length < 2) {
        console.log('\n⚠️  Algumas tabelas podem não ter sido criadas. Verifique manualmente.');
      }
    } catch (checkError) {
      console.log('⚠️  Não foi possível verificar as tabelas criadas');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erro ao executar migração:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

runMigration();

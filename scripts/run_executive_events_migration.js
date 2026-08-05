// scripts/run_executive_events_migration.js
// Script para executar a migração do sistema de Executive Event Menus

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { requireDatabaseUrl } = require('../config/resolveDatabaseUrl');

async function runMigration() {
  let pool;
  
  try {
    console.log('🚀 INICIANDO MIGRAÇÃO: Sistema de Executive Event Menus');
    console.log('====================================================\n');

    // Conectar ao banco de dados
    console.log('🔗 Conectando ao banco de dados PostgreSQL...');
    
    const connectionString = requireDatabaseUrl();
    
    pool = new Pool({
      connectionString: connectionString,
      ssl: connectionString.includes('render.com') ? { rejectUnauthorized: false } : undefined,
    });

    // Testar conexão
    await pool.query('SELECT 1');
    console.log('✅ Conectado ao banco de dados com sucesso!\n');

    // Ler o arquivo de migração
    const migrationPath = path.join(__dirname, '../migrations/create_executive_events_system.sql');
    console.log('📖 Lendo arquivo de migração...');
    console.log(`   Caminho: ${migrationPath}\n`);
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Arquivo de migração não encontrado: ${migrationPath}`);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('✅ Arquivo de migração lido com sucesso!\n');

    // Executar a migração
    console.log('📝 Executando migração SQL...\n');
    
    // Remover apenas comentários de bloco (/* ... */) que estão no final do arquivo (rollback)
    // Manter tudo que está antes do comentário de rollback
    let cleanSQL = migrationSQL;
    
    // Encontrar onde começa o comentário de rollback e remover tudo a partir daí
    const rollbackIndex = cleanSQL.indexOf('-- ========================================');
    if (rollbackIndex > 0) {
      const rollbackSection = cleanSQL.substring(rollbackIndex);
      if (rollbackSection.includes('ROLLBACK')) {
        cleanSQL = cleanSQL.substring(0, rollbackIndex);
      }
    }
    
    // Remover comentários de bloco restantes (/* ... */)
    cleanSQL = cleanSQL.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // Remover linhas de comentário (--) mas manter estrutura
    cleanSQL = cleanSQL
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return trimmed.length > 0 && !trimmed.startsWith('--');
      })
      .join('\n');

    console.log('📊 Executando migração SQL completa...\n');
    
    try {
      // Executar todo o SQL de uma vez
      await pool.query(cleanSQL);
      console.log('✅ Migração SQL executada com sucesso!\n');
    } catch (error) {
      // Se der erro, tentar executar em partes menores
      console.log('⚠️  Erro ao executar SQL completo, tentando em partes...\n');
      console.log(`   Erro: ${error.message}\n`);
      
      // Dividir em comandos menores, mas preservando funções PL/pgSQL
      const commands = [];
      let currentCommand = '';
      let inDollarQuote = false;
      let dollarTag = '';
      
      const lines = cleanSQL.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        if (trimmed.length === 0) continue;
        
        // Detectar início de dollar-quote ($$ ou $tag$)
        if (!inDollarQuote && trimmed.includes('$$')) {
          const match = trimmed.match(/\$([^$]*)\$/);
          if (match) {
            inDollarQuote = true;
            dollarTag = match[1] || '';
          }
        }
        
        currentCommand += (currentCommand ? '\n' : '') + line;
        
        // Detectar fim de dollar-quote
        if (inDollarQuote && trimmed.includes('$$')) {
          const match = trimmed.match(/\$([^$]*)\$/);
          if (match && (match[1] || '') === dollarTag) {
            inDollarQuote = false;
            dollarTag = '';
          }
        }
        
        // Se não está em dollar-quote e termina com ;, é um comando completo
        if (!inDollarQuote && trimmed.endsWith(';')) {
          commands.push(currentCommand.trim());
          currentCommand = '';
        }
      }
      
      // Adicionar último comando se não terminou com ;
      if (currentCommand.trim()) {
        commands.push(currentCommand.trim());
      }
      
      console.log(`📊 Dividido em ${commands.length} comandos SQL\n`);
      
      // Executar cada comando
      for (let i = 0; i < commands.length; i++) {
        const command = commands[i];
        if (!command || command.length === 0) continue;
        
        const commandType = command.split(/\s+/)[0].toUpperCase();
        const preview = command.substring(0, 60).replace(/\n/g, ' ').replace(/\s+/g, ' ');
        
        console.log(`  [${i + 1}/${commands.length}] ${commandType}... ${preview}...`);
        
        try {
          await pool.query(command);
          console.log(`     ✅ Comando ${i + 1} executado\n`);
        } catch (error) {
          if (error.message.includes('already exists') || 
              error.message.includes('duplicate') ||
              error.message.includes('IF NOT EXISTS')) {
            console.log(`     ⚠️  ${error.message.split('\n')[0]}\n`);
          } else {
            console.error(`     ❌ Erro: ${error.message.split('\n')[0]}\n`);
          }
        }
      }
    }

    console.log('✅ Migração SQL executada!\n');

    // Verificar se as tabelas foram criadas
    console.log('🔍 Verificando tabelas criadas...\n');
    
    const tablesToCheck = [
      'executive_events',
      'event_settings',
      'event_items',
      'event_seals'
    ];

    for (const tableName of tablesToCheck) {
      try {
        const result = await pool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'meu_backup_db' 
            AND table_name = $1
          ) OR EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )
        `, [tableName]);

        const exists = result.rows[0]?.exists || false;
        
        if (exists) {
          console.log(`  ✅ Tabela '${tableName}' existe`);
          
          // Contar registros
          try {
            const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
            const count = countResult.rows[0]?.count || 0;
            console.log(`     Registros: ${count}`);
          } catch (e) {
            // Ignorar erros de contagem
          }
        } else {
          console.log(`  ⚠️  Tabela '${tableName}' não encontrada`);
        }
      } catch (error) {
        console.log(`  ⚠️  Erro ao verificar tabela '${tableName}': ${error.message}`);
      }
    }

    // Verificar função e triggers
    console.log('\n🔍 Verificando funções e triggers...\n');
    
    try {
      const functionResult = await pool.query(`
        SELECT EXISTS (
          SELECT FROM pg_proc 
          WHERE proname = 'update_updated_at_column'
        )
      `);
      
      if (functionResult.rows[0]?.exists) {
        console.log('  ✅ Função update_updated_at_column() existe');
      } else {
        console.log('  ⚠️  Função update_updated_at_column() não encontrada');
      }
    } catch (error) {
      console.log(`  ⚠️  Erro ao verificar função: ${error.message}`);
    }

    console.log('\n====================================================');
    console.log('🎉 MIGRAÇÃO CONCLUÍDA COM SUCESSO!');
    console.log('====================================================\n');
    
    console.log('📋 Próximos passos:');
    console.log('   1. Verifique se todas as tabelas foram criadas');
    console.log('   2. Teste criar um evento via API');
    console.log('   3. Acesse /admin/executive-events no frontend\n');

  } catch (error) {
    console.error('\n❌ ERRO AO EXECUTAR MIGRAÇÃO:');
    console.error('====================================================');
    console.error(error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    console.error('====================================================\n');
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
      console.log('🔌 Conexão com banco de dados fechada');
    }
  }
}

// Executar migração
runMigration();


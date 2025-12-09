// scripts/run_add_visible_to_event_items.js
// Script para executar a migração: adicionar campo visible em event_items

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  let pool;
  
  try {
    console.log('🚀 INICIANDO MIGRAÇÃO: Adicionar campo visible em event_items');
    console.log('==========================================================\n');

    // Conectar ao banco de dados
    console.log('🔗 Conectando ao banco de dados PostgreSQL...');
    
    const connectionString = process.env.DATABASE_URL || 
      'postgresql://agilizaidb_user:9leBZwUgynZN5pnHPsqEJDW1tkE6LWjZ@dpg-d4bmh07diees73db68cg-a.oregon-postgres.render.com/agilizaidb?sslmode=prefer';
    
    pool = new Pool({
      connectionString: connectionString,
      ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
    });

    // Testar conexão
    await pool.query('SELECT 1');
    console.log('✅ Conectado ao banco de dados com sucesso!\n');

    // Ler o arquivo de migração
    const migrationPath = path.join(__dirname, '../migrations/add_visible_to_event_items.sql');
    console.log('📖 Lendo arquivo de migração...');
    console.log(`   Caminho: ${migrationPath}\n`);
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Arquivo de migração não encontrado: ${migrationPath}`);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('✅ Arquivo de migração lido com sucesso!\n');

    // Executar a migração
    console.log('📝 Executando migração SQL...\n');
    
    // Remover comentários e linhas vazias, mas manter a estrutura
    let cleanSQL = migrationSQL
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return trimmed.length > 0 && !trimmed.startsWith('--') && !trimmed.startsWith('/*');
      })
      .join('\n');

    // Dividir em comandos individuais (separados por ;)
    const commands = cleanSQL
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0);

    console.log(`📊 Executando ${commands.length} comandos SQL...\n`);

    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      if (command.trim()) {
        console.log(`  ${i + 1}/${commands.length}: Executando comando...`);
        try {
          await pool.query(command + ';');
          console.log(`  ✅ Comando ${i + 1} executado com sucesso!`);
        } catch (error) {
          // Ignorar erros de "já existe" que são normais
          if (error.message.includes('already exists') || 
              error.message.includes('duplicate') ||
              error.message.includes('duplicate key') ||
              error.message.includes('does not exist')) {
            console.log(`  ⚠️  Comando ${i + 1}: ${error.message} (ignorado - pode já existir)`);
          } else {
            console.error(`  ❌ Erro no comando ${i + 1}:`, error.message);
            throw error;
          }
        }
      }
    }

    console.log('\n✅ Migração executada com sucesso!\n');

    // Verificar se a coluna foi criada
    console.log('🔍 Verificando se a coluna foi criada...');
    const checkResult = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_schema = 'meu_backup_db'
        AND table_name = 'event_items'
        AND column_name = 'visible'
    `);

    if (checkResult.rows.length > 0) {
      console.log('✅ Coluna "visible" encontrada na tabela event_items!');
      console.log(`   Tipo: ${checkResult.rows[0].data_type}`);
      console.log(`   Default: ${checkResult.rows[0].column_default}\n`);
    } else {
      console.log('⚠️  Coluna "visible" não encontrada. Verifique manualmente.\n');
    }

    // Verificar índice
    console.log('🔍 Verificando se o índice foi criado...');
    const indexResult = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'meu_backup_db'
        AND tablename = 'event_items'
        AND indexname = 'idx_event_items_visible'
    `);

    if (indexResult.rows.length > 0) {
      console.log('✅ Índice "idx_event_items_visible" encontrado!\n');
    } else {
      console.log('⚠️  Índice não encontrado. Verifique manualmente.\n');
    }

    // Contar itens visíveis
    const countResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE visible = true) as visiveis,
        COUNT(*) FILTER (WHERE visible = false) as ocultos
      FROM meu_backup_db.event_items
    `);

    if (countResult.rows.length > 0) {
      const stats = countResult.rows[0];
      console.log('📊 Estatísticas da tabela event_items:');
      console.log(`   Total de itens: ${stats.total}`);
      console.log(`   Itens visíveis: ${stats.visiveis}`);
      console.log(`   Itens ocultos: ${stats.ocultos}\n`);
    }

    console.log('🎉 Migração concluída com sucesso!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Erro ao executar migração:');
    console.error(error);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

// Executar migração
runMigration();


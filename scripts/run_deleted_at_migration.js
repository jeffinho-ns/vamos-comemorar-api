// Script para executar a migração do campo deleted_at
// Execute: node scripts/run_deleted_at_migration.js

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Usar a mesma configuração do config/database.js
const connectionString = process.env.DATABASE_URL || 'postgresql://agilizaidb_user:9leBZwUgynZN5pnHPsqEJDW1tkE6LWjZ@dpg-d4bmh07diees73db68cg-a.oregon-postgres.render.com/agilizaidb?sslmode=prefer';

const pool = new Pool({
  connectionString: connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Iniciando migração: Adicionar campo deleted_at à tabela menu_items...\n');
    
    // Ler o arquivo SQL
    const migrationPath = path.join(__dirname, '../migrations/add_deleted_at_to_menu_items.sql');
    console.log('📄 Lendo arquivo de migração:', migrationPath);
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('✅ Arquivo lido com sucesso\n');
    
    // Executar comandos SQL específicos (não dividir blocos DO $$)
    console.log('⏳ Executando migração...\n');
    
    // 1. Adicionar coluna deleted_at (usando DO $$ para verificar se existe)
    try {
      console.log('1️⃣ Adicionando coluna deleted_at...');
      await client.query(`
        DO $$ 
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'menu_items' AND column_name = 'deleted_at'
            ) THEN
                ALTER TABLE menu_items 
                ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL;
                
                COMMENT ON COLUMN menu_items.deleted_at IS 'Data/hora da exclusão (soft delete). NULL = não deletado';
            ELSE
                RAISE NOTICE 'Coluna deleted_at já existe na tabela menu_items';
            END IF;
        END $$;
      `);
      console.log('✅ Coluna deleted_at adicionada (ou já existia)\n');
    } catch (error) {
      if (error.message.includes('already exists') || error.message.includes('já existe')) {
        console.log('⚠️  Coluna já existe (ignorando)\n');
      } else {
        console.error('❌ Erro ao adicionar coluna:', error.message);
        throw error;
      }
    }
    
    // 2. Criar índice
    try {
      console.log('2️⃣ Criando índice idx_menu_items_deleted_at...');
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_menu_items_deleted_at 
        ON menu_items(deleted_at);
      `);
      console.log('✅ Índice criado (ou já existia)\n');
    } catch (error) {
      if (error.code === '42P07' || error.message.includes('already exists')) {
        console.log('⚠️  Índice já existe (ignorando)\n');
      } else {
        console.error('❌ Erro ao criar índice:', error.message);
        throw error;
      }
    }
    
    // Executar verificações
    console.log('🔍 Executando verificações...\n');
    
    try {
      const checkColumn = await client.query(`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_name = 'menu_items'
        AND column_name = 'deleted_at'
      `);
      
      if (checkColumn.rows.length > 0) {
        console.log('✅ Coluna deleted_at encontrada:');
        console.log('   ', checkColumn.rows[0]);
      } else {
        console.log('⚠️  Coluna deleted_at NÃO encontrada!');
      }
      
      const checkIndex = await client.query(`
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'menu_items' 
        AND indexname = 'idx_menu_items_deleted_at'
      `);
      
      if (checkIndex.rows.length > 0) {
        console.log('✅ Índice idx_menu_items_deleted_at encontrado');
      } else {
        console.log('⚠️  Índice idx_menu_items_deleted_at NÃO encontrado!');
      }
      
      const countItems = await client.query(`
        SELECT 
          CASE 
            WHEN deleted_at IS NULL THEN 'Ativos'
            ELSE 'Deletados'
          END AS status,
          COUNT(*) AS total
        FROM menu_items
        GROUP BY 
          CASE 
            WHEN deleted_at IS NULL THEN 'Ativos'
            ELSE 'Deletados'
          END
      `);
      
      console.log('\n📊 Estatísticas:');
      countItems.rows.forEach(row => {
        console.log(`   ${row.status}: ${row.total} item(s)`);
      });
      
    } catch (error) {
      console.error('❌ Erro ao executar verificações:', error.message);
    }
    
    console.log('\n✅ Migração concluída com sucesso!');
    console.log('✅ Campo "deleted_at" adicionado à tabela menu_items');
    
  } catch (error) {
    console.error('❌ Erro ao executar migração:', error);
    console.error('Stack trace:', error.stack);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Executar apenas se for chamado diretamente
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('\n✅ Script executado com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Erro ao executar script:', error);
      process.exit(1);
    });
}

module.exports = runMigration;


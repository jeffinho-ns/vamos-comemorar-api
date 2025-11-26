// Script para verificar se a migração foi executada com sucesso
const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 'postgresql://agilizaidb_user:9leBZwUgynZN5pnHPsqEJDW1tkE6LWjZ@dpg-d4bmh07diees73db68cg-a.oregon-postgres.render.com/agilizaidb?sslmode=prefer';

const pool = new Pool({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

async function verifyMigration() {
  const client = await pool.connect();
  
  try {
    await client.query(`SET search_path TO meu_backup_db, public`);
    
    console.log('🔍 Verificando migração de brindes para promoters...\n');
    
    // 1. Verificar se a coluna tipo_beneficiario existe em gift_rules
    console.log('1. Verificando coluna tipo_beneficiario na tabela gift_rules...');
    try {
      const colCheck = await client.query(`
        SELECT column_name, data_type, column_default 
        FROM information_schema.columns 
        WHERE table_schema = 'meu_backup_db' 
        AND table_name = 'gift_rules' 
        AND column_name = 'tipo_beneficiario'
      `);
      
      if (colCheck.rows.length > 0) {
        console.log('   ✅ Coluna tipo_beneficiario existe');
        console.log('   Tipo:', colCheck.rows[0].data_type);
        console.log('   Default:', colCheck.rows[0].column_default);
      } else {
        console.log('   ❌ Coluna tipo_beneficiario NÃO existe');
      }
    } catch (error) {
      console.log('   ⚠️  Erro ao verificar coluna:', error.message);
    }
    
    // 2. Verificar se a tabela promoter_gifts existe
    console.log('\n2. Verificando tabela promoter_gifts...');
    try {
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'meu_backup_db' 
          AND table_name = 'promoter_gifts'
        )
      `);
      
      if (tableCheck.rows[0].exists) {
        console.log('   ✅ Tabela promoter_gifts existe');
        
        // Verificar colunas
        const cols = await client.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_schema = 'meu_backup_db' 
          AND table_name = 'promoter_gifts'
          ORDER BY ordinal_position
        `);
        console.log(`   Colunas (${cols.rows.length}):`);
        cols.rows.forEach(col => {
          console.log(`     - ${col.column_name}: ${col.data_type}`);
        });
      } else {
        console.log('   ❌ Tabela promoter_gifts NÃO existe');
      }
    } catch (error) {
      console.log('   ⚠️  Erro ao verificar tabela:', error.message);
    }
    
    // 3. Verificar índices
    console.log('\n3. Verificando índices...');
    try {
      const idxCheck = await client.query(`
        SELECT indexname 
        FROM pg_indexes 
        WHERE schemaname = 'meu_backup_db' 
        AND (indexname LIKE '%promoter_gift%' OR indexname LIKE '%tipo_beneficiario%')
      `);
      
      if (idxCheck.rows.length > 0) {
        console.log(`   ✅ ${idxCheck.rows.length} índice(s) encontrado(s):`);
        idxCheck.rows.forEach(idx => {
          console.log(`     - ${idx.indexname}`);
        });
      } else {
        console.log('   ⚠️  Nenhum índice encontrado');
      }
    } catch (error) {
      console.log('   ⚠️  Erro ao verificar índices:', error.message);
    }
    
    console.log('\n✅ Verificação concluída!');
  } catch (error) {
    console.error('❌ Erro na verificação:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

verifyMigration();


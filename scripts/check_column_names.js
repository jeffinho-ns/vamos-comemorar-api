// Script para verificar nomes das colunas no banco PostgreSQL
const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 'postgresql://agilizaidb_user:9leBZwUgynZN5pnHPsqEJDW1tkE6LWjZ@dpg-d4bmh07diees73db68cg-a.oregon-postgres.render.com/agilizaidb?sslmode=prefer';

const pool = new Pool({
  connectionString: connectionString,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function checkColumns() {
  const client = await pool.connect();
  
  try {
    await client.query(`SET search_path TO meu_backup_db, public`);
    
    // Verificar colunas de bars
    console.log('🔍 Colunas da tabela bars:');
    const barsColumns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'bars' 
      AND table_schema = 'meu_backup_db'
      ORDER BY ordinal_position
    `);
    barsColumns.rows.forEach(col => {
      console.log(`   ${col.column_name} (${col.data_type})`);
    });
    
    // Verificar colunas de menu_items
    console.log('\n🔍 Colunas da tabela menu_items:');
    const itemsColumns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'menu_items' 
      AND table_schema = 'meu_backup_db'
      ORDER BY ordinal_position
    `);
    itemsColumns.rows.forEach(col => {
      console.log(`   ${col.column_name} (${col.data_type})`);
    });
    
    // Verificar um registro de exemplo
    console.log('\n📊 Exemplo de registro de bars:');
    const barExample = await client.query('SELECT * FROM bars LIMIT 1');
    if (barExample.rows.length > 0) {
      console.log('   Campos retornados:', Object.keys(barExample.rows[0]));
      console.log('   logoUrl/logourl:', barExample.rows[0].logourl || barExample.rows[0].logoUrl);
      console.log('   coverImageUrl/coverimageurl:', barExample.rows[0].coverimageurl || barExample.rows[0].coverImageUrl);
    }
    
    console.log('\n📊 Exemplo de registro de menu_items:');
    const itemExample = await client.query('SELECT * FROM menu_items LIMIT 1');
    if (itemExample.rows.length > 0) {
      console.log('   Campos retornados:', Object.keys(itemExample.rows[0]));
      console.log('   imageUrl/imageurl:', itemExample.rows[0].imageurl || itemExample.rows[0].imageUrl);
      console.log('   categoryId/categoryid:', itemExample.rows[0].categoryid || itemExample.rows[0].categoryId);
      console.log('   barId/barid:', itemExample.rows[0].barid || itemExample.rows[0].barId);
    }
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkColumns();


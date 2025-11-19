// Script para verificar campos de categorias
const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 'postgresql://agilizaidb_user:9leBZwUgynZN5pnHPsqEJDW1tkE6LWjZ@dpg-d4bmh07diees73db68cg-a.oregon-postgres.render.com/agilizaidb?sslmode=prefer';

const pool = new Pool({
  connectionString: connectionString,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function checkCategories() {
  const client = await pool.connect();
  
  try {
    await client.query(`SET search_path TO meu_backup_db, public`);
    
    console.log('🔍 Colunas da tabela menu_categories:');
    const columns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'menu_categories' 
      AND table_schema = 'meu_backup_db'
      ORDER BY ordinal_position
    `);
    columns.rows.forEach(col => {
      console.log(`   ${col.column_name} (${col.data_type})`);
    });
    
    console.log('\n📊 Exemplo de registro de menu_categories:');
    const example = await client.query('SELECT * FROM menu_categories LIMIT 1');
    if (example.rows.length > 0) {
      console.log('   Campos retornados:', Object.keys(example.rows[0]));
      console.log('   barId/barid:', example.rows[0].barid || example.rows[0].barId);
    }
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkCategories();


/**
 * Script para excluir a lista de convidados da Laís Carretero
 * Execute: node scripts/excluir_lista_lais_carretero.js
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function excluirListaLaisCarretero() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Buscando lista de convidados da Laís Carretero...');
    
    // Buscar a lista
    const searchResult = await client.query(`
      SELECT 
        gl.id as guest_list_id,
        gl.reservation_id,
        gl.reservation_type,
        COALESCE(lr.client_name, rr.client_name) as owner_name,
        COALESCE(lr.reservation_date, rr.reservation_date) as reservation_date
      FROM guest_lists gl
      LEFT JOIN large_reservations lr ON gl.reservation_id = lr.id AND gl.reservation_type = 'large'
      LEFT JOIN restaurant_reservations rr ON gl.reservation_id = rr.id AND gl.reservation_type = 'restaurant'
      WHERE 
        LOWER(COALESCE(lr.client_name, rr.client_name)) LIKE '%laís%carretero%' 
        OR LOWER(COALESCE(lr.client_name, rr.client_name)) LIKE '%lais%carretero%'
        OR LOWER(COALESCE(lr.client_name, rr.client_name)) LIKE '%lais carretero%'
    `);
    
    if (searchResult.rows.length === 0) {
      console.log('❌ Nenhuma lista encontrada para Laís Carretero');
      return;
    }
    
    console.log(`✅ Encontradas ${searchResult.rows.length} lista(s):`);
    searchResult.rows.forEach((row, index) => {
      console.log(`  ${index + 1}. ID: ${row.guest_list_id}, Dono: ${row.owner_name}, Data: ${row.reservation_date}`);
    });
    
    // Confirmar exclusão
    const guestListIds = searchResult.rows.map(row => row.guest_list_id);
    
    console.log('\n🗑️  Excluindo convidados das listas...');
    for (const id of guestListIds) {
      const deleteGuestsResult = await client.query(
        'DELETE FROM guests WHERE guest_list_id = $1',
        [id]
      );
      console.log(`  ✅ ${deleteGuestsResult.rowCount} convidado(s) excluído(s) da lista ${id}`);
    }
    
    console.log('\n🗑️  Excluindo as listas...');
    for (const id of guestListIds) {
      const deleteListResult = await client.query(
        'DELETE FROM guest_lists WHERE id = $1',
        [id]
      );
      console.log(`  ✅ Lista ${id} excluída`);
    }
    
    console.log('\n✅ Processo concluído com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro ao excluir lista:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Executar
excluirListaLaisCarretero()
  .then(() => {
    console.log('✅ Script finalizado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });



/**
 * Script para limpar itens deletados há mais de 30 dias
 * 
 * Este script deve ser executado periodicamente (diariamente ou semanalmente)
 * para excluir permanentemente itens que foram deletados há mais de 30 dias.
 * 
 * Uso:
 *   node scripts/cleanup_deleted_items.js
 * 
 * Ou configure como cron job:
 *   0 2 * * * cd /path/to/project && node scripts/cleanup_deleted_items.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://user:password@localhost/database',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function cleanupDeletedItems() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Iniciando limpeza de itens deletados há mais de 30 dias...');
    
    // Buscar itens deletados há mais de 30 dias
    const checkResult = await client.query(`
      SELECT 
        id, 
        name, 
        deleted_at,
        EXTRACT(EPOCH FROM (NOW() - deleted_at)) / 86400 as days_deleted
      FROM menu_items
      WHERE deleted_at IS NOT NULL
        AND deleted_at < NOW() - INTERVAL '30 days'
      ORDER BY deleted_at ASC
    `);
    
    const itemsToDelete = checkResult.rows;
    
    if (itemsToDelete.length === 0) {
      console.log('✅ Nenhum item para excluir permanentemente.');
      return;
    }
    
    console.log(`📋 Encontrados ${itemsToDelete.length} item(s) para excluir permanentemente:`);
    itemsToDelete.forEach(item => {
      console.log(`   - ID ${item.id}: "${item.name}" (deletado há ${Math.floor(item.days_deleted)} dias)`);
    });
    
    await client.query('BEGIN');
    
    try {
      // Primeiro, deletar os relacionamentos (item_toppings)
      const itemIds = itemsToDelete.map(item => item.id);
      await client.query(
        'DELETE FROM item_toppings WHERE item_id = ANY($1::int[])',
        [itemIds]
      );
      
      console.log(`✅ Relacionamentos deletados para ${itemsToDelete.length} item(s).`);
      
      // Depois, deletar os itens permanentemente
      const deleteResult = await client.query(
        'DELETE FROM menu_items WHERE id = ANY($1::int[])',
        [itemIds]
      );
      
      await client.query('COMMIT');
      
      console.log(`✅ ${deleteResult.rowCount} item(s) excluído(s) permanentemente com sucesso!`);
      console.log('✅ Limpeza concluída.');
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('❌ Erro ao limpar itens deletados:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Executar apenas se for chamado diretamente (não quando importado)
if (require.main === module) {
  cleanupDeletedItems()
    .then(() => {
      console.log('✅ Script executado com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erro ao executar script:', error);
      process.exit(1);
    });
}

module.exports = cleanupDeletedItems;


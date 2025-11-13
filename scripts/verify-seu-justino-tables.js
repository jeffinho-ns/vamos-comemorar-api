/*
  Verifica se as mesas do Seu Justino foram inseridas corretamente
*/

const pool = require('../config/database');

async function verify() {
  try {
    console.log('🔍 Verificando mesas do Seu Justino...\n');
    
    // Verificar mesas do Lounge (area_id = 1)
    const [loungeTables] = await pool.execute(
      `SELECT table_number, capacity, table_type, description 
       FROM restaurant_tables 
       WHERE area_id = 1 
       AND table_number IN ('200', '202', '204', '206', '208', '210')
       ORDER BY CAST(table_number AS UNSIGNED)`
    );
    
    console.log(`📊 Mesas do Lounge (area_id = 1): ${loungeTables.length} encontradas`);
    loungeTables.forEach(t => {
      console.log(`   - Mesa ${t.table_number}: ${t.capacity}p (${t.table_type}) - ${t.description}`);
    });
    
    // Verificar mesas do Quintal (area_id = 2)
    const [quintalTables] = await pool.execute(
      `SELECT table_number, capacity, table_type, description 
       FROM restaurant_tables 
       WHERE area_id = 2 
       AND table_number IN ('20', '22', '24', '26', '28', '29', '30', '32', '34', '36', '38', '39', '40', '42', '44', '46', '48', '50', '52', '54', '56', '58', '60', '62', '64')
       ORDER BY CAST(table_number AS UNSIGNED)`
    );
    
    console.log(`\n📊 Mesas do Quintal (area_id = 2): ${quintalTables.length} encontradas`);
    quintalTables.forEach(t => {
      console.log(`   - Mesa ${t.table_number}: ${t.capacity}p (${t.table_type}) - ${t.description}`);
    });
    
    const total = loungeTables.length + quintalTables.length;
    console.log(`\n✅ Total de mesas do Seu Justino: ${total}/29`);
    
    if (total === 29) {
      console.log('✅ Todas as mesas foram inseridas com sucesso!');
    } else {
      console.log(`⚠️  Esperado 29 mesas, mas encontrado ${total}`);
    }
    
  } catch (err) {
    console.error('❌ Erro ao verificar:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

verify().catch(err => {
  console.error('Falha ao verificar:', err);
  process.exit(1);
});




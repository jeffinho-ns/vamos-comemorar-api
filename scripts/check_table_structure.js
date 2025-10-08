const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: '193.203.175.55',
  user: 'u621081794_vamos',
  password: '@123Mudar!@',
  database: 'u621081794_vamos',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function checkTableStructure() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔍 Verificando estrutura da tabela reservas_camarote...');
    
    const [columns] = await connection.query(`
      DESCRIBE reservas_camarote
    `);
    
    console.log('📋 Colunas da tabela reservas_camarote:');
    columns.forEach(col => {
      console.log(`   - ${col.Field} (${col.Type}) - ${col.Null === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
    console.log('\n🔍 Verificando estrutura da tabela camarotes...');
    
    const [camarotesColumns] = await connection.query(`
      DESCRIBE camarotes
    `);
    
    console.log('📋 Colunas da tabela camarotes:');
    camarotesColumns.forEach(col => {
      console.log(`   - ${col.Field} (${col.Type}) - ${col.Null === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    connection.release();
    await pool.end();
  }
}

checkTableStructure();

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

async function addDateFields() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔄 Adicionando campos de data à tabela reservas_camarote...');
    
    // Adicionar campo data_reserva
    try {
      await connection.query(`
        ALTER TABLE reservas_camarote 
        ADD COLUMN data_reserva DATE NULL AFTER hora_reserva
      `);
      console.log('✅ Campo data_reserva adicionado');
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        console.log('ℹ️ Campo data_reserva já existe');
      } else {
        throw error;
      }
    }
    
    // Adicionar campo data_expiracao
    try {
      await connection.query(`
        ALTER TABLE reservas_camarote 
        ADD COLUMN data_expiracao DATE NULL AFTER data_reserva
      `);
      console.log('✅ Campo data_expiracao adicionado');
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        console.log('ℹ️ Campo data_expiracao já existe');
      } else {
        throw error;
      }
    }
    
    // Atualizar reservas existentes com datas
    console.log('\n🔄 Atualizando reservas existentes com datas...');
    
    await connection.query(`
      UPDATE reservas_camarote 
      SET data_reserva = CURDATE() 
      WHERE data_reserva IS NULL
    `);
    console.log('✅ Data de reserva definida para reservas existentes');
    
    await connection.query(`
      UPDATE reservas_camarote 
      SET data_expiracao = DATE_ADD(CURDATE(), INTERVAL 7 DAY) 
      WHERE data_expiracao IS NULL
    `);
    console.log('✅ Data de expiração definida para reservas existentes (7 dias)');
    
    // Verificar a estrutura atualizada
    console.log('\n📋 Verificando estrutura atualizada...');
    const [columns] = await connection.query(`
      DESCRIBE reservas_camarote
    `);
    
    console.log('📋 Colunas da tabela reservas_camarote:');
    columns.forEach(col => {
      console.log(`   - ${col.Field} (${col.Type}) - ${col.Null === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
    // Testar a consulta da API
    console.log('\n🔍 Testando consulta da API...');
    const [camarotes] = await connection.query(`
      SELECT 
        c.id, 
        c.nome_camarote, 
        c.capacidade_maxima, 
        c.status,
        rc.id AS reserva_camarote_id,
        rc.nome_cliente,
        rc.entradas_unisex_free,
        rc.entradas_masculino_free,
        rc.entradas_feminino_free,
        rc.valor_camarote,
        rc.valor_consumacao,
        rc.valor_pago,
        rc.valor_sinal,
        rc.status_reserva,
        rc.data_reserva,
        rc.data_expiracao
      FROM camarotes c
      LEFT JOIN reservas_camarote rc ON c.id = rc.id_camarote AND rc.status_reserva != 'disponivel'
      WHERE c.id_place = ?
      ORDER BY c.nome_camarote
    `, [7]);
    
    console.log(`📋 Encontrados ${camarotes.length} camarotes para o High Line:`);
    
    camarotes.forEach((camarote, index) => {
      console.log(`\n${index + 1}. ${camarote.nome_camarote} (ID: ${camarote.id})`);
      
      if (camarote.reserva_camarote_id) {
        console.log(`   📋 RESERVADO:`);
        console.log(`   Cliente: ${camarote.nome_cliente}`);
        console.log(`   Valor Pago: R$ ${camarote.valor_pago}`);
        console.log(`   Valor Sinal: R$ ${camarote.valor_sinal}`);
        console.log(`   Valor Total: R$ ${(parseFloat(camarote.valor_sinal || 0) + parseFloat(camarote.valor_pago || 0)).toFixed(2)}`);
        console.log(`   Data Reserva: ${camarote.data_reserva}`);
        console.log(`   Data Expiração: ${camarote.data_expiracao}`);
      } else {
        console.log(`   ✅ DISPONÍVEL`);
      }
    });
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    connection.release();
    await pool.end();
  }
}

addDateFields();












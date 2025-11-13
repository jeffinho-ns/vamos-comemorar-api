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

async function testApiValues() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔍 Testando consulta da API para camarotes...');
    
    // Simular a consulta que a API faz
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
    `, [7]); // ID do High Line
    
    console.log(`📋 Encontrados ${camarotes.length} camarotes para o High Line (id_place = 7):`);
    
    camarotes.forEach((camarote, index) => {
      console.log(`\n${index + 1}. ${camarote.nome_camarote} (ID: ${camarote.id})`);
      console.log(`   Status: ${camarote.status}`);
      console.log(`   Capacidade: ${camarote.capacidade_maxima} pessoas`);
      
      if (camarote.reserva_camarote_id) {
        console.log(`   📋 RESERVADO:`);
        console.log(`   Cliente: ${camarote.nome_cliente}`);
        console.log(`   Valor Camarote: R$ ${camarote.valor_camarote}`);
        console.log(`   Valor Consumação: R$ ${camarote.valor_consumacao}`);
        console.log(`   Valor Pago: R$ ${camarote.valor_pago}`);
        console.log(`   Valor Sinal: R$ ${camarote.valor_sinal}`);
        console.log(`   Valor Total: R$ ${(parseFloat(camarote.valor_sinal || 0) + parseFloat(camarote.valor_pago || 0)).toFixed(2)}`);
        console.log(`   Status Reserva: ${camarote.status_reserva}`);
        console.log(`   Data Reserva: ${camarote.data_reserva}`);
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

testApiValues();





















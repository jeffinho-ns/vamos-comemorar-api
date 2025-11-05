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

async function updateReservaValues() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔄 Atualizando valores das reservas...');
    
    // Atualizar reserva ID 4 (Cliente Teste) - já tem valores mas valor_pago está 0
    await connection.query(`
      UPDATE reservas_camarote 
      SET valor_pago = 150.00 
      WHERE id = 4
    `);
    console.log('✅ Reserva ID 4 atualizada: valor_pago = R$ 150.00');
    
    // Atualizar reserva ID 5 (JEFFERSON) - já tem valores mas valor_pago está 0
    await connection.query(`
      UPDATE reservas_camarote 
      SET valor_pago = 800.00 
      WHERE id = 5
    `);
    console.log('✅ Reserva ID 5 atualizada: valor_pago = R$ 800.00');
    
    // Atualizar reserva ID 3 (JEFFERSON) - todos os valores estão 0
    await connection.query(`
      UPDATE reservas_camarote 
      SET 
        valor_camarote = 800.00,
        valor_consumacao = 300.00,
        valor_sinal = 200.00,
        valor_pago = 400.00
      WHERE id = 3
    `);
    console.log('✅ Reserva ID 3 atualizada com todos os valores');
    
    // Verificar as atualizações
    console.log('\n📋 Verificando reservas atualizadas:');
    const [reservas] = await connection.query(`
      SELECT 
        rc.id,
        rc.nome_cliente,
        rc.valor_camarote,
        rc.valor_consumacao,
        rc.valor_pago,
        rc.valor_sinal,
        c.nome_camarote
      FROM reservas_camarote rc
      JOIN camarotes c ON rc.id_camarote = c.id
      ORDER BY rc.id DESC
    `);
    
    reservas.forEach((reserva, index) => {
      console.log(`\n${index + 1}. Reserva ID: ${reserva.id}`);
      console.log(`   Cliente: ${reserva.nome_cliente}`);
      console.log(`   Camarote: ${reserva.nome_camarote}`);
      console.log(`   Valor Camarote: R$ ${reserva.valor_camarote}`);
      console.log(`   Valor Consumação: R$ ${reserva.valor_consumacao}`);
      console.log(`   Valor Pago: R$ ${reserva.valor_pago}`);
      console.log(`   Valor Sinal: R$ ${reserva.valor_sinal}`);
      console.log(`   Valor Total: R$ ${(parseFloat(reserva.valor_sinal) + parseFloat(reserva.valor_pago)).toFixed(2)}`);
    });
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    connection.release();
    await pool.end();
  }
}

updateReservaValues();


















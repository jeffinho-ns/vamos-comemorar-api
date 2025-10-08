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

async function checkAndUpdateReservas() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔍 Verificando reservas existentes...');
    
    // 1. Verificar todas as reservas de camarote
    const [reservas] = await connection.query(`
      SELECT 
        rc.id,
        rc.nome_cliente,
        rc.valor_camarote,
        rc.valor_consumacao,
        rc.valor_pago,
        rc.valor_sinal,
        rc.status_reserva,
        c.nome_camarote,
        c.id_place
      FROM reservas_camarote rc
      JOIN camarotes c ON rc.id_camarote = c.id
      ORDER BY rc.id DESC
    `);
    
    console.log(`📋 Encontradas ${reservas.length} reservas:`);
    
    if (reservas.length === 0) {
      console.log('⚠️ Nenhuma reserva encontrada. Criando uma reserva de teste...');
      
      // Criar uma reserva de teste com valores
      const [result] = await connection.query(`
        INSERT INTO reservas_camarote (
          id_camarote, nome_cliente, telefone, email,
          maximo_pessoas, valor_camarote, valor_consumacao, 
          valor_pago, valor_sinal, status_reserva, data_reserva
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        1, // ID do primeiro camarote
        'Cliente Teste',
        '11999999999',
        'teste@exemplo.com',
        10,
        500.00, // valor_camarote
        200.00, // valor_consumacao
        300.00, // valor_pago
        100.00, // valor_sinal
        'reservado',
        new Date().toISOString().split('T')[0] // data_reserva
      ]);
      
      console.log('✅ Reserva de teste criada com ID:', result.insertId);
    } else {
      // Mostrar reservas existentes
      reservas.forEach((reserva, index) => {
        console.log(`\n${index + 1}. Reserva ID: ${reserva.id}`);
        console.log(`   Cliente: ${reserva.nome_cliente}`);
        console.log(`   Camarote: ${reserva.nome_camarote}`);
        console.log(`   Valor Camarote: R$ ${reserva.valor_camarote || 0}`);
        console.log(`   Valor Consumação: R$ ${reserva.valor_consumacao || 0}`);
        console.log(`   Valor Pago: R$ ${reserva.valor_pago || 0}`);
        console.log(`   Valor Sinal: R$ ${reserva.valor_sinal || 0}`);
        console.log(`   Status: ${reserva.status_reserva}`);
      });
      
      // Atualizar reservas que têm valor_camarote mas não têm valor_sinal ou valor_pago
      console.log('\n🔄 Atualizando reservas com valores zerados...');
      
      for (const reserva of reservas) {
        const updates = [];
        const values = [];
        
        // Se tem valor_camarote mas não tem valor_sinal, definir um valor padrão
        if (reserva.valor_camarote > 0 && (!reserva.valor_sinal || reserva.valor_sinal === 0)) {
          updates.push('valor_sinal = ?');
          values.push(reserva.valor_camarote * 0.2); // 20% do valor do camarote
        }
        
        // Se tem valor_camarote mas não tem valor_pago, definir um valor padrão
        if (reserva.valor_camarote > 0 && (!reserva.valor_pago || reserva.valor_pago === 0)) {
          updates.push('valor_pago = ?');
          values.push(reserva.valor_camarote * 0.3); // 30% do valor do camarote
        }
        
        if (updates.length > 0) {
          values.push(reserva.id);
          const sql = `UPDATE reservas_camarote SET ${updates.join(', ')} WHERE id = ?`;
          await connection.query(sql, values);
          console.log(`✅ Reserva ID ${reserva.id} atualizada`);
        }
      }
    }
    
    // 2. Verificar camarotes disponíveis
    console.log('\n🏢 Verificando camarotes disponíveis...');
    const [camarotes] = await connection.query(`
      SELECT id, nome_camarote, id_place, capacidade_maxima 
      FROM camarotes 
      ORDER BY id_place, nome_camarote
    `);
    
    console.log(`📋 Encontrados ${camarotes.length} camarotes:`);
    camarotes.forEach(camarote => {
      console.log(`   - ${camarote.nome_camarote} (ID: ${camarote.id}, Place: ${camarote.id_place})`);
    });
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    connection.release();
    await pool.end();
  }
}

checkAndUpdateReservas();

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

async function testDirectUpdate() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔍 Testando atualização direta no banco...');
    
    // 1. Verificar reserva atual
    const [reservas] = await connection.query(`
      SELECT 
        rc.id,
        rc.nome_cliente,
        rc.valor_pago,
        rc.valor_sinal,
        rc.telefone,
        rc.email,
        c.nome_camarote
      FROM reservas_camarote rc
      JOIN camarotes c ON rc.id_camarote = c.id
      WHERE rc.id = 4
    `);
    
    if (reservas.length === 0) {
      console.log('❌ Reserva ID 4 não encontrada');
      return;
    }
    
    const reserva = reservas[0];
    console.log('📋 Estado atual da reserva ID 4:');
    console.log(`   Cliente: ${reserva.nome_cliente}`);
    console.log(`   Valor Pago: R$ ${reserva.valor_pago}`);
    console.log(`   Valor Sinal: R$ ${reserva.valor_sinal}`);
    console.log(`   Telefone: ${reserva.telefone}`);
    console.log(`   Email: ${reserva.email}`);
    
    // 2. Fazer atualização direta
    console.log('\n🔄 Fazendo atualização direta...');
    const novosValores = {
      valor_pago: 250.00,
      valor_sinal: 150.00,
      telefone: '11988887777',
      email: 'teste_atualizado@exemplo.com'
    };
    
    const [result] = await connection.query(`
      UPDATE reservas_camarote 
      SET 
        valor_pago = ?,
        valor_sinal = ?,
        telefone = ?,
        email = ?
      WHERE id = ?
    `, [
      novosValores.valor_pago,
      novosValores.valor_sinal,
      novosValores.telefone,
      novosValores.email,
      4
    ]);
    
    console.log(`✅ Atualização executada. Linhas afetadas: ${result.affectedRows}`);
    
    // 3. Verificar se foi salvo
    console.log('\n🔍 Verificando se foi salvo...');
    const [reservaAtualizada] = await connection.query(`
      SELECT 
        rc.id,
        rc.nome_cliente,
        rc.valor_pago,
        rc.valor_sinal,
        rc.telefone,
        rc.email
      FROM reservas_camarote rc
      WHERE rc.id = 4
    `);
    
    if (reservaAtualizada.length > 0) {
      const dados = reservaAtualizada[0];
      console.log('📋 Estado após atualização:');
      console.log(`   Valor Pago: R$ ${dados.valor_pago} (esperado: R$ ${novosValores.valor_pago})`);
      console.log(`   Valor Sinal: R$ ${dados.valor_sinal} (esperado: R$ ${novosValores.valor_sinal})`);
      console.log(`   Telefone: ${dados.telefone} (esperado: ${novosValores.telefone})`);
      console.log(`   Email: ${dados.email} (esperado: ${novosValores.email})`);
      
      if (parseFloat(dados.valor_pago) === novosValores.valor_pago && 
          parseFloat(dados.valor_sinal) === novosValores.valor_sinal &&
          dados.telefone === novosValores.telefone &&
          dados.email === novosValores.email) {
        console.log('✅ Atualização direta funcionou corretamente!');
      } else {
        console.log('❌ Atualização direta falhou!');
      }
    }
    
    // 4. Testar a consulta da API
    console.log('\n🔍 Testando consulta da API...');
    const [apiData] = await connection.query(`
      SELECT 
        c.id, 
        c.nome_camarote, 
        c.capacidade_maxima, 
        c.status,
        rc.id AS reserva_camarote_id,
        rc.nome_cliente,
        rc.valor_pago,
        rc.valor_sinal,
        rc.status_reserva,
        rc.data_reserva,
        rc.data_expiracao
      FROM camarotes c
      LEFT JOIN reservas_camarote rc ON c.id = rc.id_camarote AND rc.status_reserva != 'disponivel'
      WHERE c.id_place = 7 AND rc.id = 4
    `);
    
    if (apiData.length > 0) {
      const camarote = apiData[0];
      console.log('📋 Dados retornados pela consulta da API:');
      console.log(`   Valor Pago: R$ ${camarote.valor_pago}`);
      console.log(`   Valor Sinal: R$ ${camarote.valor_sinal}`);
      console.log(`   Valor Total: R$ ${(parseFloat(camarote.valor_sinal || 0) + parseFloat(camarote.valor_pago || 0)).toFixed(2)}`);
    }
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    connection.release();
    await pool.end();
  }
}

testDirectUpdate();










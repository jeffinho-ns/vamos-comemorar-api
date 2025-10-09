const mysql = require('mysql2/promise');
const fetch = require('node-fetch');

const pool = mysql.createPool({
  host: '193.203.175.55',
  user: 'u621081794_vamos',
  password: '@123Mudar!@',
  database: 'u621081794_vamos',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function testUpdateFlow() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔍 Testando fluxo completo de atualização...');
    
    // 1. Verificar reservas existentes
    console.log('\n1️⃣ Verificando reservas existentes...');
    const [reservas] = await connection.query(`
      SELECT 
        rc.id,
        rc.nome_cliente,
        rc.valor_pago,
        rc.valor_sinal,
        rc.status_reserva,
        c.nome_camarote
      FROM reservas_camarote rc
      JOIN camarotes c ON rc.id_camarote = c.id
      WHERE rc.status_reserva != 'disponivel'
      ORDER BY rc.id DESC
      LIMIT 3
    `);
    
    console.log(`📋 Encontradas ${reservas.length} reservas:`);
    reservas.forEach((reserva, index) => {
      console.log(`   ${index + 1}. ID: ${reserva.id} - ${reserva.nome_camarote} - Cliente: ${reserva.nome_cliente}`);
      console.log(`      Valor Pago: R$ ${reserva.valor_pago} | Valor Sinal: R$ ${reserva.valor_sinal}`);
    });
    
    if (reservas.length === 0) {
      console.log('❌ Nenhuma reserva encontrada para testar');
      return;
    }
    
    // 2. Fazer login para obter token
    console.log('\n2️⃣ Fazendo login...');
    const loginResponse = await fetch('https://vamos-comemorar-api.onrender.com/api/users/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'admin@teste.com',
        password: '123456'
      })
    });
    
    if (!loginResponse.ok) {
      console.log('❌ Falha no login. Criando usuário de teste...');
      
      // Criar usuário de teste
      await connection.query(`
        INSERT IGNORE INTO users (name, email, password, role) 
        VALUES (?, ?, ?, ?)
      `, ['Admin Teste', 'admin@teste.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin']);
      
      console.log('✅ Usuário de teste criado');
      
      // Tentar login novamente
      const loginResponse2 = await fetch('https://vamos-comemorar-api.onrender.com/api/users/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: 'admin@teste.com',
          password: 'password'
        })
      });
      
      if (!loginResponse2.ok) {
        console.log('❌ Ainda falha no login');
        return;
      }
      
      var loginData = await loginResponse2.json();
    } else {
      var loginData = await loginResponse.json();
    }
    
    if (!loginData.token) {
      console.log('❌ Token não recebido');
      return;
    }
    
    console.log('✅ Login realizado com sucesso');
    
    // 3. Testar atualização de uma reserva
    const reservaTeste = reservas[0];
    console.log(`\n3️⃣ Testando atualização da reserva ID ${reservaTeste.id}...`);
    
    const novosValores = {
      valor_pago: parseFloat(reservaTeste.valor_pago) + 100,
      valor_sinal: parseFloat(reservaTeste.valor_sinal) + 50,
      nome_cliente: reservaTeste.nome_cliente,
      telefone: '11999999999',
      email: 'teste@exemplo.com'
    };
    
    console.log('📤 Enviando atualização:', novosValores);
    
    const updateResponse = await fetch(`https://vamos-comemorar-api.onrender.com/api/reservas/camarote/${reservaTeste.id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${loginData.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(novosValores)
    });
    
    console.log('📡 Status da atualização:', updateResponse.status);
    
    if (updateResponse.ok) {
      const updateResult = await updateResponse.json();
      console.log('✅ Atualização bem-sucedida:', updateResult);
      
      // 4. Verificar se os dados foram salvos no banco
      console.log('\n4️⃣ Verificando se os dados foram salvos...');
      const [reservaAtualizada] = await connection.query(`
        SELECT 
          rc.id,
          rc.nome_cliente,
          rc.valor_pago,
          rc.valor_sinal,
          rc.telefone,
          rc.email
        FROM reservas_camarote rc
        WHERE rc.id = ?
      `, [reservaTeste.id]);
      
      if (reservaAtualizada.length > 0) {
        const dados = reservaAtualizada[0];
        console.log('📋 Dados no banco após atualização:');
        console.log(`   Valor Pago: R$ ${dados.valor_pago} (esperado: R$ ${novosValores.valor_pago})`);
        console.log(`   Valor Sinal: R$ ${dados.valor_sinal} (esperado: R$ ${novosValores.valor_sinal})`);
        console.log(`   Telefone: ${dados.telefone} (esperado: ${novosValores.telefone})`);
        console.log(`   Email: ${dados.email} (esperado: ${novosValores.email})`);
        
        if (parseFloat(dados.valor_pago) === novosValores.valor_pago && 
            parseFloat(dados.valor_sinal) === novosValores.valor_sinal) {
          console.log('✅ Dados salvos corretamente no banco!');
        } else {
          console.log('❌ Dados não foram salvos corretamente!');
        }
      } else {
        console.log('❌ Reserva não encontrada após atualização');
      }
      
    } else {
      const errorText = await updateResponse.text();
      console.log('❌ Erro na atualização:', errorText);
    }
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    connection.release();
    await pool.end();
  }
}

testUpdateFlow();




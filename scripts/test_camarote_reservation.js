const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Configuração da API
const API_BASE_URL = 'https://vamos-comemorar-api.onrender.com';

async function testCamaroteReservation() {
  try {
    console.log('🔍 Testando criação de reserva de camarote...');
    
    // 1. Fazer login para obter token
    console.log('\n1️⃣ Fazendo login...');
    const loginResponse = await fetch(`${API_BASE_URL}/api/users/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        access: 'admin@teste.com',
        password: '123456'
      })
    });
    
    if (!loginResponse.ok) {
      console.log('❌ Falha no login');
      return;
    }
    
    const loginData = await loginResponse.json();
    const token = loginData.token;
    console.log('✅ Login realizado com sucesso!');
    
    // 2. Buscar camarotes disponíveis
    console.log('\n2️⃣ Buscando camarotes disponíveis...');
    const camarotesResponse = await fetch(`${API_BASE_URL}/api/reservas/camarotes/7`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!camarotesResponse.ok) {
      console.log('❌ Falha ao buscar camarotes');
      return;
    }
    
    const camarotes = await camarotesResponse.json();
    console.log(`✅ ${camarotes.length} camarotes encontrados`);
    
    // Encontrar um camarote disponível
    const camaroteDisponivel = camarotes.find(c => !c.reserva_camarote_id);
    if (!camaroteDisponivel) {
      console.log('❌ Nenhum camarote disponível para teste');
      return;
    }
    
    console.log(`✅ Usando camarote: ${camaroteDisponivel.nome_camarote} (ID: ${camaroteDisponivel.id})`);
    
    // 3. Criar reserva de camarote
    console.log('\n3️⃣ Criando reserva de camarote...');
    const reservaData = {
      id_camarote: camaroteDisponivel.id,
      id_evento: 11, // Halloween no High Line
      nome_cliente: 'Cliente Teste',
      telefone: '11999999999',
      email: 'cliente@teste.com',
      data_nascimento: '1990-01-01',
      maximo_pessoas: camaroteDisponivel.capacidade_maxima,
      entradas_unisex_free: 0,
      entradas_masculino_free: 0,
      entradas_feminino_free: 0,
      valor_camarote: 500.00,
      valor_consumacao: 200.00,
      valor_pago: 0.00,
      valor_sinal: 100.00,
      prazo_sinal_dias: 7,
      solicitado_por: 'Admin Teste',
      observacao: 'Reserva de teste criada via script',
      status_reserva: 'pre-reservado',
      tag: 'TESTE',
      hora_reserva: '20:00:00',
      lista_convidados: [
        { nome: 'Convidado 1', email: 'convidado1@teste.com' },
        { nome: 'Convidado 2', email: 'convidado2@teste.com' }
      ]
    };
    
    console.log('📋 Dados da reserva:', JSON.stringify(reservaData, null, 2));
    
    const reservaResponse = await fetch(`${API_BASE_URL}/api/reservas/camarote`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(reservaData)
    });
    
    console.log(`Status da criação: ${reservaResponse.status}`);
    
    if (reservaResponse.ok) {
      const result = await reservaResponse.json();
      console.log('✅ Reserva criada com sucesso!');
      console.log('📋 Resultado:', JSON.stringify(result, null, 2));
      
      // 4. Verificar se a reserva foi salva no banco
      console.log('\n4️⃣ Verificando reserva no banco de dados...');
      const verificacaoResponse = await fetch(`${API_BASE_URL}/api/reservas/camarotes/7`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (verificacaoResponse.ok) {
        const camarotesAtualizados = await verificacaoResponse.json();
        const camaroteReservado = camarotesAtualizados.find(c => c.id === camaroteDisponivel.id);
        
        if (camaroteReservado && camaroteReservado.reserva_camarote_id) {
          console.log('✅ Reserva confirmada no banco de dados!');
          console.log(`📋 Cliente: ${camaroteReservado.nome_cliente}`);
          console.log(`📋 Status: ${camaroteReservado.status_reserva}`);
          console.log(`📋 Valor: R$ ${camaroteReservado.valor_camarote}`);
        } else {
          console.log('❌ Reserva não encontrada no banco de dados');
        }
      }
      
    } else {
      const errorText = await reservaResponse.text();
      console.log('❌ Erro ao criar reserva:', errorText);
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

testCamaroteReservation();

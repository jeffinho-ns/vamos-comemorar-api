const fetch = require('node-fetch');

async function testLoginAndUpdate() {
  try {
    console.log('🔍 Testando login e atualização...');
    
    // 1. Fazer login
    console.log('\n1️⃣ Fazendo login...');
    const loginResponse = await fetch('https://vamos-comemorar-api.onrender.com/api/users/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        access: 'admin@teste.com',
        password: '123456'
      })
    });
    
    console.log('Status do login:', loginResponse.status);
    
    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      console.log('❌ Erro no login:', errorText);
      return;
    }
    
    const loginData = await loginResponse.json();
    console.log('✅ Login realizado com sucesso!');
    console.log('Token recebido:', loginData.token ? 'Sim' : 'Não');
    
    if (!loginData.token) {
      console.log('❌ Token não recebido');
      return;
    }
    
    // 2. Testar atualização
    console.log('\n2️⃣ Testando atualização...');
    
    const updateData = {
      valor_pago: 300.00,
      valor_sinal: 200.00,
      nome_cliente: 'Cliente Teste',
      telefone: '11977776666',
      email: 'teste_atualizado@exemplo.com'
    };
    
    console.log('📤 Dados da atualização:', updateData);
    
    const updateResponse = await fetch('https://vamos-comemorar-api.onrender.com/api/reservas/camarote/4', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${loginData.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateData)
    });
    
    console.log('Status da atualização:', updateResponse.status);
    
    if (updateResponse.ok) {
      const updateResult = await updateResponse.json();
      console.log('✅ Atualização bem-sucedida!');
      console.log('Resposta:', updateResult);
    } else {
      const errorText = await updateResponse.text();
      console.log('❌ Erro na atualização:', errorText);
    }
    
    // 3. Verificar se foi salvo consultando a API
    console.log('\n3️⃣ Verificando se foi salvo...');
    
    const checkResponse = await fetch('https://vamos-comemorar-api.onrender.com/api/reservas/camarotes/7', {
      headers: {
        'Authorization': `Bearer ${loginData.token}`
      }
    });
    
    if (checkResponse.ok) {
      const camarotes = await checkResponse.json();
      console.log('📋 Camarotes retornados:', camarotes.length);
      
      const camaroteC31 = camarotes.find(c => c.id === 2); // C31 tem reserva ID 4
      if (camaroteC31 && camaroteC31.reserva_camarote_id) {
        console.log('📋 Dados do C31:');
        console.log(`   Valor Pago: R$ ${camaroteC31.valor_pago}`);
        console.log(`   Valor Sinal: R$ ${camaroteC31.valor_sinal}`);
        console.log(`   Valor Total: R$ ${(parseFloat(camaroteC31.valor_sinal || 0) + parseFloat(camaroteC31.valor_pago || 0)).toFixed(2)}`);
        console.log(`   Cliente: ${camaroteC31.nome_cliente}`);
      }
    } else {
      console.log('❌ Erro ao verificar dados');
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

testLoginAndUpdate();

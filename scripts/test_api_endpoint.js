const fetch = require('node-fetch');

async function testApiEndpoint() {
  try {
    console.log('🔍 Testando endpoint da API...');
    
    // URL que o frontend está usando
    const API_URL = 'https://vamos-comemorar-api.onrender.com';
    const endpoint = `${API_URL}/api/reservas/camarotes/7`; // High Line
    
    console.log('📡 Fazendo requisição para:', endpoint);
    
    // Teste sem autenticação primeiro
    console.log('\n1️⃣ Testando sem autenticação...');
    const response1 = await fetch(endpoint);
    console.log('   Status:', response1.status);
    console.log('   Headers:', Object.fromEntries(response1.headers.entries()));
    
    if (response1.status === 403) {
      console.log('   ✅ Endpoint protegido (esperado)');
    } else {
      console.log('   ⚠️ Endpoint não protegido como esperado');
    }
    
    // Teste com token inválido
    console.log('\n2️⃣ Testando com token inválido...');
    const response2 = await fetch(endpoint, {
      headers: {
        'Authorization': 'Bearer token_invalido'
      }
    });
    console.log('   Status:', response2.status);
    
    // Verificar se o servidor está rodando
    console.log('\n3️⃣ Verificando se o servidor está rodando...');
    const healthResponse = await fetch(`${API_URL}/api/places`);
    console.log('   Status /api/places:', healthResponse.status);
    
    if (healthResponse.ok) {
      console.log('   ✅ Servidor está rodando');
    } else {
      console.log('   ❌ Servidor com problemas');
    }
    
    // Teste com token válido (se conseguirmos um)
    console.log('\n4️⃣ Tentando fazer login para obter token...');
    
    const loginResponse = await fetch(`${API_URL}/api/users/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'admin@teste.com',
        password: '123456'
      })
    });
    
    if (loginResponse.ok) {
      const loginData = await loginResponse.json();
      console.log('   ✅ Login realizado com sucesso');
      
      if (loginData.token) {
        console.log('\n5️⃣ Testando endpoint com token válido...');
        const authResponse = await fetch(endpoint, {
          headers: {
            'Authorization': `Bearer ${loginData.token}`
          }
        });
        
        console.log('   Status:', authResponse.status);
        
        if (authResponse.ok) {
          const data = await authResponse.json();
          console.log('   ✅ Dados recebidos:', data.length, 'camarotes');
          
          if (data.length > 0) {
            const primeiroCamarote = data[0];
            console.log('\n📋 Primeiro camarote:');
            console.log('   Nome:', primeiroCamarote.nome_camarote);
            console.log('   Valor Pago:', primeiroCamarote.valor_pago);
            console.log('   Valor Sinal:', primeiroCamarote.valor_sinal);
            console.log('   Valor Total:', (parseFloat(primeiroCamarote.valor_sinal || 0) + parseFloat(primeiroCamarote.valor_pago || 0)).toFixed(2));
          }
        } else {
          const errorText = await authResponse.text();
          console.log('   ❌ Erro:', errorText);
        }
      }
    } else {
      console.log('   ❌ Falha no login');
      const errorText = await loginResponse.text();
      console.log('   Erro:', errorText);
    }
    
  } catch (error) {
    console.error('❌ Erro na requisição:', error.message);
  }
}

testApiEndpoint();













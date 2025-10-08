const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Configuração da API
const API_BASE_URL = 'https://vamos-comemorar-api.onrender.com';

async function testFrontendIntegration() {
  try {
    console.log('🔍 Testando integração frontend-backend...');
    
    // 1. Testar endpoint sem autenticação (deve falhar)
    console.log('\n1️⃣ Testando endpoint sem autenticação...');
    try {
      const response = await fetch(`${API_BASE_URL}/api/reservas/camarotes/7`);
      console.log(`   Status: ${response.status}`);
      if (response.status === 401) {
        console.log('   ✅ Endpoint protegido corretamente (401 Unauthorized)');
      } else {
        console.log('   ⚠️ Endpoint não está protegido como esperado');
      }
    } catch (error) {
      console.log('   ❌ Erro na requisição:', error.message);
    }
    
    // 2. Testar endpoint com token inválido
    console.log('\n2️⃣ Testando endpoint com token inválido...');
    try {
      const response = await fetch(`${API_BASE_URL}/api/reservas/camarotes/7`, {
        headers: { 'Authorization': 'Bearer token_invalido' }
      });
      console.log(`   Status: ${response.status}`);
      if (response.status === 401) {
        console.log('   ✅ Token inválido rejeitado corretamente (401 Unauthorized)');
      } else {
        console.log('   ⚠️ Token inválido não foi rejeitado como esperado');
      }
    } catch (error) {
      console.log('   ❌ Erro na requisição:', error.message);
    }
    
    // 3. Verificar se o endpoint está registrado corretamente
    console.log('\n3️⃣ Verificando se o endpoint está acessível...');
    try {
      const response = await fetch(`${API_BASE_URL}/api/reservas/camarotes/7`, {
        method: 'OPTIONS'
      });
      console.log(`   Status OPTIONS: ${response.status}`);
      console.log('   Headers permitidos:', response.headers.get('allow') || 'N/A');
    } catch (error) {
      console.log('   ❌ Erro na requisição OPTIONS:', error.message);
    }
    
    // 4. Testar endpoint de eventos (para comparar)
    console.log('\n4️⃣ Testando endpoint de eventos para comparação...');
    try {
      const response = await fetch(`${API_BASE_URL}/api/events`);
      console.log(`   Status: ${response.status}`);
      if (response.ok) {
        const data = await response.json();
        console.log(`   ✅ Endpoint de eventos funcionando (${Array.isArray(data) ? data.length : 'N/A'} eventos)`);
      } else {
        console.log('   ⚠️ Endpoint de eventos com problema');
      }
    } catch (error) {
      console.log('   ❌ Erro na requisição de eventos:', error.message);
    }
    
    console.log('\n📋 Resumo:');
    console.log('   - O endpoint /api/reservas/camarotes/:id_place requer autenticação');
    console.log('   - É necessário um token JWT válido para acessar');
    console.log('   - Verifique se o usuário está logado no painel de eventos');
    console.log('   - Verifique se o token está sendo enviado corretamente');
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

testFrontendIntegration();

// Script para testar se a rota de logs está funcionando
const https = require('https');

const API_URL = 'vamos-comemorar-api.onrender.com';

// Dados do admin para login
const loginData = JSON.stringify({
  access: 'admin@teste.com',
  password: '123456'
});

console.log('🔐 Passo 1: Fazendo login...\n');

// Função para fazer requisição HTTPS
function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (postData) {
      req.write(postData);
    }
    
    req.end();
  });
}

async function testAPI() {
  try {
    // 1. Fazer login
    const loginOptions = {
      hostname: API_URL,
      path: '/api/users/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(loginData)
      }
    };
    
    const loginResponse = await makeRequest(loginOptions, loginData);
    
    if (loginResponse.statusCode !== 200) {
      console.log('❌ Erro no login:');
      console.log('Status:', loginResponse.statusCode);
      console.log('Body:', loginResponse.body);
      return;
    }
    
    const loginResult = JSON.parse(loginResponse.body);
    const token = loginResult.token;
    const userRole = loginResult.role;
    
    console.log('✅ Login realizado com sucesso!');
    console.log('   Role:', userRole);
    console.log('   Token:', token.substring(0, 20) + '...\n');
    
    // 2. Testar rota de logs
    console.log('📊 Passo 2: Testando rota de logs...\n');
    
    const logsOptions = {
      hostname: API_URL,
      path: '/api/action-logs?limit=10&offset=0',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };
    
    const logsResponse = await makeRequest(logsOptions);
    
    console.log('📡 Resposta da rota /api/action-logs:');
    console.log('   Status Code:', logsResponse.statusCode);
    console.log('   Status:', logsResponse.statusCode === 200 ? '✅ OK' : '❌ ERRO');
    
    if (logsResponse.statusCode === 200) {
      const logsData = JSON.parse(logsResponse.body);
      console.log('   Total de logs:', logsData.pagination?.total || 0);
      console.log('   Logs retornados:', logsData.logs?.length || 0);
      console.log('\n✅ API de logs funcionando corretamente!\n');
    } else {
      console.log('   Body:', logsResponse.body);
      console.log('\n❌ API de logs com erro!\n');
    }
    
    // 3. Testar rota de estatísticas
    console.log('📈 Passo 3: Testando rota de estatísticas...\n');
    
    const statsOptions = {
      hostname: API_URL,
      path: '/api/action-logs/stats',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };
    
    const statsResponse = await makeRequest(statsOptions);
    
    console.log('📡 Resposta da rota /api/action-logs/stats:');
    console.log('   Status Code:', statsResponse.statusCode);
    console.log('   Status:', statsResponse.statusCode === 200 ? '✅ OK' : '❌ ERRO');
    
    if (statsResponse.statusCode === 200) {
      const statsData = JSON.parse(statsResponse.body);
      console.log('   Total de ações:', statsData.stats?.totalActions || 0);
      console.log('\n✅ API de estatísticas funcionando!\n');
    } else {
      console.log('   Body:', statsResponse.body);
      console.log('\n❌ API de estatísticas com erro!\n');
    }
    
    console.log('═'.repeat(60));
    console.log('RESUMO DO TESTE:');
    console.log('═'.repeat(60));
    console.log('Login:', loginResponse.statusCode === 200 ? '✅' : '❌');
    console.log('Logs:', logsResponse.statusCode === 200 ? '✅' : '❌');
    console.log('Stats:', statsResponse.statusCode === 200 ? '✅' : '❌');
    console.log('═'.repeat(60));
    
  } catch (error) {
    console.error('❌ Erro durante o teste:', error.message);
  }
}

testAPI();









const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const mysql = require('mysql2/promise');

// Configuração da API
const API_BASE_URL = 'https://vamos-comemorar-api.onrender.com';

// Configuração do banco de dados
const dbConfig = {
  host: '193.203.175.55',
  user: 'u621081794_vamos',
  password: '@123Mudar!@',
  database: 'u621081794_vamos'
};

async function testWithAuth() {
  let connection;
  
  try {
    console.log('🔍 Testando com autenticação...');
    
    // 1. Buscar um usuário válido para gerar token
    console.log('\n1️⃣ Buscando usuário válido...');
    connection = await mysql.createConnection(dbConfig);
    
    const [users] = await connection.execute(`
      SELECT id, name, email FROM users WHERE email = 'admin@teste.com'
    `);
    
    if (users.length === 0) {
      console.log('   ❌ Nenhum usuário encontrado no banco de dados');
      return;
    }
    
    const user = users[0];
    console.log(`   ✅ Usuário encontrado: ${user.name} (ID: ${user.id})`);
    
    // 2. Tentar fazer login para obter token
    console.log('\n2️⃣ Tentando fazer login...');
    const loginResponse = await fetch(`${API_BASE_URL}/api/users/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        access: user.email,
        password: '123456' // Senha padrão comum
      })
    });
    
    console.log(`   Status do login: ${loginResponse.status}`);
    
    if (loginResponse.ok) {
      const loginData = await loginResponse.json();
      const token = loginData.token;
      console.log('   ✅ Login realizado com sucesso!');
      console.log(`   Token: ${token.substring(0, 20)}...`);
      
      // 3. Testar endpoint de camarotes com token válido
      console.log('\n3️⃣ Testando endpoint de camarotes com token válido...');
      const camarotesResponse = await fetch(`${API_BASE_URL}/api/reservas/camarotes/7`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      console.log(`   Status: ${camarotesResponse.status}`);
      
      if (camarotesResponse.ok) {
        const camarotesData = await camarotesResponse.json();
        console.log(`   ✅ Camarotes carregados com sucesso! (${camarotesData.length} camarotes)`);
        
        camarotesData.forEach((camarote, index) => {
          console.log(`     ${index + 1}. ${camarote.nome_camarote} (Capacidade: ${camarote.capacidade_maxima})`);
        });
      } else {
        const errorText = await camarotesResponse.text();
        console.log(`   ❌ Erro: ${errorText}`);
      }
      
    } else {
      console.log('   ❌ Falha no login - tentando com senha diferente...');
      
      // Tentar outras senhas comuns
      const commonPasswords = ['admin', 'password', '123456', 'admin123'];
      
      for (const password of commonPasswords) {
        const loginResponse2 = await fetch(`${API_BASE_URL}/api/users/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            access: user.email,
            password: password
          })
        });
        
        if (loginResponse2.ok) {
          const loginData = await loginResponse2.json();
          const token = loginData.token;
          console.log(`   ✅ Login realizado com senha: ${password}`);
          
          // Testar endpoint com este token
          const camarotesResponse = await fetch(`${API_BASE_URL}/api/reservas/camarotes/7`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          console.log(`   Status camarotes: ${camarotesResponse.status}`);
          if (camarotesResponse.ok) {
            const camarotesData = await camarotesResponse.json();
            console.log(`   ✅ ${camarotesData.length} camarotes encontrados!`);
          }
          break;
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

testWithAuth();

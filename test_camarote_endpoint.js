const axios = require('axios');

// Simular dados que o frontend está enviando
const testPayload = {
  id_camarote: 1,
  id_evento: null,
  nome_cliente: 'Teste Cliente',
  telefone: '11999999999',
  cpf_cnpj: '12345678901',
  email: 'teste@teste.com',
  data_nascimento: null,
  maximo_pessoas: 10,
  entradas_unisex_free: 0,
  entradas_masculino_free: 0,
  entradas_feminino_free: 0,
  valor_camarote: 100.00,
  valor_consumacao: 50.00,
  valor_pago: 0.00,
  valor_sinal: 0.00,
  prazo_sinal_dias: 0,
  solicitado_por: 'Admin',
  observacao: 'Teste via script',
  status_reserva: 'reservado',
  tag: '',
  hora_reserva: null,
  lista_convidados: []
};

async function testCamaroteEndpoint() {
  try {
    console.log('🧪 Testando endpoint de camarote...');
    console.log('📤 Payload:', JSON.stringify(testPayload, null, 2));
    
    const response = await axios.post(
      'https://vamos-comemorar-api.onrender.com/api/reservas/camarote',
      testPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer YOUR_TOKEN_HERE' // Substitua por um token válido
        }
      }
    );
    
    console.log('✅ Sucesso!');
    console.log('📊 Status:', response.status);
    console.log('📄 Response:', response.data);
    
  } catch (error) {
    console.error('❌ Erro no teste:');
    if (error.response) {
      console.error('📊 Status:', error.response.status);
      console.error('📄 Data:', error.response.data);
      console.error('📋 Headers:', error.response.headers);
    } else {
      console.error('🚫 Erro de rede:', error.message);
    }
  }
}

// Teste sem autenticação primeiro
async function testWithoutAuth() {
  try {
    console.log('🔓 Testando sem autenticação...');
    
    const response = await axios.post(
      'https://vamos-comemorar-api.onrender.com/api/reservas/camarote',
      testPayload,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Sucesso sem auth!');
    console.log('📊 Status:', response.status);
    console.log('📄 Response:', response.data);
    
  } catch (error) {
    console.error('❌ Erro sem auth:');
    if (error.response) {
      console.error('📊 Status:', error.response.status);
      console.error('📄 Data:', error.response.data);
    } else {
      console.error('🚫 Erro de rede:', error.message);
    }
  }
}

// Executar testes
console.log('🚀 Iniciando testes do endpoint de camarote...\n');

testWithoutAuth().then(() => {
  console.log('\n' + '='.repeat(50) + '\n');
  testCamaroteEndpoint();
}); 
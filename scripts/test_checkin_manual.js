/**
 * Script para testar o check-in automático manualmente
 * Permite testar sem estar no local do evento
 * 
 * Uso: node scripts/test_checkin_manual.js <TOKEN> <NOME_CONVIDADO>
 * 
 * Exemplo: node scripts/test_checkin_manual.js abc123 "João Silva"
 */

require('dotenv').config();

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'https://vamos-comemorar-api.onrender.com';

async function testCheckIn() {
  const token = process.argv[2];
  const name = process.argv[3];

  if (!token || !name) {
    console.log('❌ Uso: node scripts/test_checkin_manual.js <TOKEN> <NOME_CONVIDADO>');
    console.log('');
    console.log('Exemplo:');
    console.log('  node scripts/test_checkin_manual.js abc123 "João Silva"');
    process.exit(1);
  }

  // Coordenadas de teste (qualquer coordenada serve quando skip_geo_validation está ativo)
  const latitude = -23.5505199;
  const longitude = -46.6333094;

  console.log('🧪 Testando check-in automático...\n');
  console.log(`Token: ${token}`);
  console.log(`Nome: ${name}`);
  console.log(`Coordenadas: ${latitude}, ${longitude}`);
  console.log(`Modo: Teste (validações de geolocalização e horário desabilitadas)\n`);

  try {
    const response = await fetch(`${API_URL}/api/checkins/self-validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: token,
        name: name,
        latitude: latitude,
        longitude: longitude,
        skip_geo_validation: true, // Desabilita validação de geolocalização para teste
        skip_time_validation: true  // Desabilita validação de horário para teste
      })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      console.log('✅ Check-in realizado com sucesso!');
      console.log('');
      console.log('Detalhes:');
      console.log(`  - ID do convidado: ${data.guest?.id}`);
      console.log(`  - Nome: ${data.guest?.name}`);
      console.log(`  - Check-in realizado: ${data.guest?.checked_in ? 'Sim' : 'Não'}`);
      console.log(`  - Horário: ${data.guest?.checkin_time || 'N/A'}`);
      console.log(`  - Mensagem: ${data.message}`);
    } else {
      console.log('❌ Erro ao realizar check-in:');
      console.log(`  - Status: ${response.status}`);
      console.log(`  - Erro: ${data.error || data.message || 'Erro desconhecido'}`);
      
      if (data.error) {
        console.log('');
        console.log('💡 Dicas:');
        if (data.error.includes('não encontrado')) {
          console.log('  - Verifique se o nome está exatamente como aparece na lista');
          console.log('  - O nome é case-insensitive, mas deve estar completo');
        }
        if (data.error.includes('horário')) {
          console.log('  - Verifique se está dentro do horário permitido');
          console.log('  - Check-in é permitido a partir da hora da reserva até o final do dia seguinte');
        }
        if (data.error.includes('local')) {
          console.log('  - A validação de geolocalização está ativa');
          console.log('  - Use skip_geo_validation: true para desabilitar em testes');
        }
      }
    }
  } catch (error) {
    console.error('❌ Erro ao conectar com o servidor:');
    console.error(`  ${error.message}`);
    console.log('');
    console.log('💡 Verifique:');
    console.log('  - Se o servidor está rodando');
    console.log('  - Se a URL da API está correta');
    console.log('  - Se há conexão com a internet');
  }
}

testCheckIn();


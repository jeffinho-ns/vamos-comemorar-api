/**
 * Script de teste para verificar o fluxo completo de reserva de aniversário via API
 * 
 * Este script testa:
 * 1. Criar uma reserva de aniversário para o estabelecimento Highline (ID 7)
 * 2. Buscar reservas por establishment_id = 7
 * 3. Verificar se a reserva aparece na busca
 */

const fetch = require('node-fetch');

const API_BASE_URL = process.env.API_BASE_URL || 'https://vamos-comemorar-api.onrender.com/api';

async function testBirthdayReservationAPI() {
  console.log('🧪 Iniciando teste de fluxo de reserva de aniversário via API...\n');
  console.log('🌐 API URL:', API_BASE_URL);
  
  try {
    // 1. Criar uma reserva de teste para Highline (ID 7)
    console.log('\n📝 1. Criando reserva de teste para Highline (ID 7)...');
    const testReservationData = {
      user_id: 1,
      aniversariante_nome: 'Teste Automatizado - ' + new Date().toISOString(),
      data_aniversario: new Date('2026-01-15').toISOString(),
      quantidade_convidados: 10,
      id_casa_evento: 7, // Highline
      area_id: 2, // Área de teste
      reservation_time: '19:00:00', // Horário de teste
      decoracao_tipo: 'Decoração Teste',
      painel_personalizado: false,
      item_bar_bebida_1: 0,
      item_bar_bebida_2: 0,
      item_bar_bebida_3: 0,
      item_bar_bebida_4: 0,
      item_bar_bebida_5: 0,
      item_bar_bebida_6: 0,
      item_bar_bebida_7: 0,
      item_bar_bebida_8: 0,
      item_bar_bebida_9: 0,
      item_bar_bebida_10: 0,
      item_bar_comida_1: 0,
      item_bar_comida_2: 0,
      item_bar_comida_3: 0,
      item_bar_comida_4: 0,
      item_bar_comida_5: 0,
      item_bar_comida_6: 0,
      item_bar_comida_7: 0,
      item_bar_comida_8: 0,
      item_bar_comida_9: 0,
      item_bar_comida_10: 0,
      lista_presentes: [],
      documento: null,
      whatsapp: null,
      email: null
    };
    
    console.log('📤 Dados enviados:', {
      id_casa_evento: testReservationData.id_casa_evento,
      area_id: testReservationData.area_id,
      reservation_time: testReservationData.reservation_time,
      aniversariante_nome: testReservationData.aniversariante_nome
    });
    
    const createResponse = await fetch(`${API_BASE_URL}/birthday-reservations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testReservationData)
    });
    
    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error('❌ Erro ao criar reserva:', createResponse.status, errorText);
      return;
    }
    
    const createResult = await createResponse.json();
    console.log('✅ Reserva criada com sucesso!');
    console.log('   ID:', createResult.id);
    console.log('   restaurant_reservation_id:', createResult.restaurant_reservation_id);
    console.log('   Mensagem:', createResult.message);
    
    const reservationId = createResult.id;
    
    // Aguardar um pouco para garantir que a transação foi commitada
    console.log('\n⏳ Aguardando 2 segundos para garantir commit da transação...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 2. Buscar reservas por establishment_id = 7
    console.log('\n🔍 2. Buscando reservas para Highline (establishment_id = 7)...');
    const searchResponse = await fetch(`${API_BASE_URL}/birthday-reservations?establishment_id=7`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('❌ Erro ao buscar reservas:', searchResponse.status, errorText);
      return;
    }
    
    const searchResults = await searchResponse.json();
    console.log('✅ Busca concluída!');
    console.log('   Total de reservas encontradas:', Array.isArray(searchResults) ? searchResults.length : 0);
    
    if (Array.isArray(searchResults) && searchResults.length > 0) {
      console.log('\n📋 Reservas encontradas:');
      searchResults.forEach((r, index) => {
        console.log(`   ${index + 1}. ID: ${r.id} | id_casa_evento: ${r.id_casa_evento} | Nome: ${r.aniversariante_nome}`);
      });
      
      // Verificar se a reserva criada está na lista
      const foundReservation = searchResults.find(r => String(r.id) === String(reservationId));
      if (foundReservation) {
        console.log('\n✅ SUCESSO: A reserva criada foi encontrada na busca!');
        console.log('   ID da reserva:', foundReservation.id);
        console.log('   id_casa_evento:', foundReservation.id_casa_evento);
        console.log('   Nome:', foundReservation.aniversariante_nome);
        console.log('   place_name:', foundReservation.place_name || 'N/A');
      } else {
        console.log('\n❌ PROBLEMA: A reserva criada (ID:', reservationId, ') não foi encontrada na busca!');
        console.log('   Isso indica um problema com o filtro por establishment_id.');
      }
    } else {
      console.log('\n⚠️ Nenhuma reserva encontrada para Highline (ID 7)');
      console.log('   Isso pode indicar:');
      console.log('   1. A reserva não foi salva corretamente');
      console.log('   2. O filtro por establishment_id não está funcionando');
      console.log('   3. O id_casa_evento foi salvo com valor diferente de 7');
    }
    
    // 3. Buscar todas as reservas (sem filtro) para comparação
    console.log('\n🔍 3. Buscando todas as reservas (sem filtro) para comparação...');
    const allResponse = await fetch(`${API_BASE_URL}/birthday-reservations`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (allResponse.ok) {
      const allResults = await allResponse.json();
      console.log('   Total de reservas no sistema:', Array.isArray(allResults) ? allResults.length : 0);
      
      if (Array.isArray(allResults)) {
        const highlineReservations = allResults.filter(r => String(r.id_casa_evento) === '7' || r.id_casa_evento === 7);
        console.log('   Reservas com id_casa_evento = 7 (encontradas sem filtro):', highlineReservations.length);
        
        if (highlineReservations.length > 0) {
          console.log('   📋 Reservas de Highline encontradas:');
          highlineReservations.forEach((r, index) => {
            console.log(`      ${index + 1}. ID: ${r.id} | id_casa_evento: ${r.id_casa_evento} | Nome: ${r.aniversariante_nome}`);
          });
        }
      }
    }
    
    // Verificar se a reserva criada está na lista
    let foundReservation = null;
    if (Array.isArray(searchResults) && searchResults.length > 0) {
      foundReservation = searchResults.find(r => String(r.id) === String(reservationId));
    }
    
    console.log('\n✅ Teste concluído!');
    console.log('\n📝 Resumo:');
    console.log('   - Reserva criada:', reservationId ? '✅ Sim (ID: ' + reservationId + ')' : '❌ Não');
    console.log('   - Reserva encontrada na busca filtrada:', foundReservation ? '✅ Sim' : '❌ Não');
    
  } catch (error) {
    console.error('\n❌ Erro durante o teste:', error);
    throw error;
  }
}

// Executar o teste
testBirthdayReservationAPI()
  .then(() => {
    console.log('\n🎉 Teste executado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Teste falhou:', error);
    process.exit(1);
  });


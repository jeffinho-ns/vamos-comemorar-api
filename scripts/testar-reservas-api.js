// =====================================================
// Script de Teste: Verificar Reservas e Guest Lists
// =====================================================
// Este script testa as APIs de reservas para diagnosticar
// por que as reservas não aparecem no calendário
// =====================================================

const https = require('https');
const http = require('http');

// =====================================================
// CONFIGURAÇÃO
// =====================================================

const API_URL = process.env.API_URL || 'https://vamos-comemorar-api.onrender.com';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'seu-token-aqui';
const ESTABLISHMENT_ID = process.env.ESTABLISHMENT_ID || 7; // HighLine

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

function makeRequest(url, token = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    };

    const req = protocol.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    
    req.on('error', (e) => {
      reject(e);
    });
    
    req.end();
  });
}

function log(icon, message, data = null) {
  console.log(`${icon} ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

// =====================================================
// TESTES
// =====================================================

async function runTests() {
  console.log('🚀 Iniciando testes da API de Reservas\n');
  console.log(`📍 API URL: ${API_URL}`);
  console.log(`🏢 Estabelecimento ID: ${ESTABLISHMENT_ID}\n`);
  
  try {
    // ====================================================
    // TESTE 1: Verificar se a API está online
    // ====================================================
    log('🔍', 'TESTE 1: Verificando se a API está online...');
    const healthCheck = await makeRequest(`${API_URL}/health`);
    
    if (healthCheck.status === 200) {
      log('✅', 'API está online', healthCheck.data);
    } else {
      log('❌', 'API não está respondendo corretamente', healthCheck);
      return;
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    // ====================================================
    // TESTE 2: Buscar reservas normais (restaurant_reservations)
    // ====================================================
    log('🔍', 'TESTE 2: Buscando reservas normais...');
    const normalReservations = await makeRequest(
      `${API_URL}/api/restaurant-reservations?establishment_id=${ESTABLISHMENT_ID}`,
      AUTH_TOKEN
    );
    
    if (normalReservations.status === 200) {
      const count = normalReservations.data.reservations?.length || 0;
      log('✅', `${count} reservas normais encontradas`);
      
      if (count > 0) {
        log('📋', 'Primeiras 3 reservas:', normalReservations.data.reservations.slice(0, 3).map(r => ({
          id: r.id,
          client_name: r.client_name,
          reservation_date: r.reservation_date,
          reservation_time: r.reservation_time,
          status: r.status
        })));
        
        // Verificar datas
        const dates = normalReservations.data.reservations.map(r => r.reservation_date);
        const year2024 = dates.filter(d => d && d.startsWith('2024')).length;
        const year2025 = dates.filter(d => d && d.startsWith('2025')).length;
        
        if (year2024 > 0) {
          log('⚠️', `PROBLEMA ENCONTRADO: ${year2024} reservas com data de 2024 (ano passado)`);
          log('💡', 'Solução: Execute o script de migração para corrigir as datas');
        }
        
        if (year2025 > 0) {
          log('✅', `${year2025} reservas com data de 2025 (ano atual)`);
        }
      } else {
        log('⚠️', 'Nenhuma reserva normal encontrada');
      }
    } else {
      log('❌', 'Erro ao buscar reservas normais', normalReservations);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    // ====================================================
    // TESTE 3: Buscar reservas grandes (large_reservations)
    // ====================================================
    log('🔍', 'TESTE 3: Buscando reservas grandes...');
    const largeReservations = await makeRequest(
      `${API_URL}/api/large-reservations?establishment_id=${ESTABLISHMENT_ID}`,
      AUTH_TOKEN
    );
    
    if (largeReservations.status === 200) {
      const count = largeReservations.data.reservations?.length || 0;
      log('✅', `${count} reservas grandes encontradas`);
      
      if (count > 0) {
        log('📋', 'Primeiras 3 reservas:', largeReservations.data.reservations.slice(0, 3).map(r => ({
          id: r.id,
          client_name: r.client_name,
          reservation_date: r.reservation_date,
          number_of_people: r.number_of_people
        })));
      }
    } else {
      log('❌', 'Erro ao buscar reservas grandes', largeReservations);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    // ====================================================
    // TESTE 4: Buscar guest lists (mês atual)
    // ====================================================
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    log('🔍', `TESTE 4: Buscando guest lists do mês atual (${currentMonth})...`);
    const guestLists = await makeRequest(
      `${API_URL}/api/admin/guest-lists?month=${currentMonth}&establishment_id=${ESTABLISHMENT_ID}`,
      AUTH_TOKEN
    );
    
    if (guestLists.status === 200) {
      const count = guestLists.data.guestLists?.length || 0;
      log('✅', `${count} guest lists encontradas para o mês ${currentMonth}`);
      
      if (count > 0) {
        log('📋', 'Primeiras 3 listas:', guestLists.data.guestLists.slice(0, 3).map(gl => ({
          id: gl.guest_list_id,
          owner: gl.owner_name,
          date: gl.reservation_date,
          type: gl.event_type
        })));
      } else {
        log('⚠️', `Nenhuma guest list encontrada para ${currentMonth}`);
        log('💡', 'Verifique se há listas para outros meses');
      }
    } else {
      log('❌', 'Erro ao buscar guest lists', guestLists);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    // ====================================================
    // TESTE 5: Buscar TODAS as guest lists (sem filtro de mês)
    // ====================================================
    log('🔍', 'TESTE 5: Buscando TODAS as guest lists...');
    const allGuestLists = await makeRequest(
      `${API_URL}/api/admin/guest-lists?show_all=true&establishment_id=${ESTABLISHMENT_ID}`,
      AUTH_TOKEN
    );
    
    if (allGuestLists.status === 200) {
      const count = allGuestLists.data.guestLists?.length || 0;
      log('✅', `${count} guest lists encontradas (total)`);
      
      if (count > 0) {
        // Agrupar por mês
        const byMonth = {};
        allGuestLists.data.guestLists.forEach(gl => {
          const month = gl.reservation_date.slice(0, 7);
          byMonth[month] = (byMonth[month] || 0) + 1;
        });
        
        log('📊', 'Distribuição por mês:', byMonth);
      }
    } else {
      log('❌', 'Erro ao buscar todas as guest lists', allGuestLists);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    // ====================================================
    // RESUMO FINAL
    // ====================================================
    console.log('📊 RESUMO DOS TESTES\n');
    
    const normalCount = normalReservations.data?.reservations?.length || 0;
    const largeCount = largeReservations.data?.reservations?.length || 0;
    const guestListsCount = guestLists.data?.guestLists?.length || 0;
    const allGuestListsCount = allGuestLists.data?.guestLists?.length || 0;
    
    console.log(`✅ Reservas Normais: ${normalCount}`);
    console.log(`✅ Reservas Grandes: ${largeCount}`);
    console.log(`✅ Guest Lists (mês atual): ${guestListsCount}`);
    console.log(`✅ Guest Lists (total): ${allGuestListsCount}`);
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    if (normalCount === 0 && largeCount === 0) {
      log('❌', 'PROBLEMA: Nenhuma reserva encontrada');
      console.log('\n💡 Possíveis causas:');
      console.log('   1. Estabelecimento ID incorreto');
      console.log('   2. Não há reservas cadastradas no banco');
      console.log('   3. Problema de autenticação');
    } else if (guestListsCount === 0 && allGuestListsCount > 0) {
      log('⚠️', 'PROBLEMA: Existem guest lists mas não para o mês atual');
      console.log('\n💡 Solução:');
      console.log('   Execute o script de migração para corrigir as datas:');
      console.log('   mysql -u usuario -p database < migrations/corrigir_datas_reservas_2024_para_2025.sql');
    } else {
      log('✅', 'Sistema funcionando corretamente!');
    }
    
  } catch (error) {
    log('❌', 'Erro ao executar testes:', error.message);
  }
}

// =====================================================
// EXECUTAR TESTES
// =====================================================

if (require.main === module) {
  runTests().then(() => {
    console.log('\n✅ Testes concluídos\n');
  }).catch(err => {
    console.error('\n❌ Erro nos testes:', err);
    process.exit(1);
  });
}

module.exports = { runTests };









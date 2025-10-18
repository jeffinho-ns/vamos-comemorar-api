// Script de debug para encontrar reservas do Leo Cury
// Execute com: node scripts/debug-reservas-leo-cury.js

require('dotenv').config();
const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'vamos_comemorar',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

async function debugLeoCuryReservations() {
  let connection;
  
  try {
    console.log('🔌 Conectando ao banco de dados...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conectado!\n');

    // 1. Buscar em reservas normais
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 RESERVAS NORMAIS (restaurant_reservations)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const [normalReservations] = await connection.execute(`
      SELECT 
        rr.id,
        rr.client_name,
        rr.client_phone,
        rr.reservation_date,
        rr.reservation_time,
        rr.number_of_people,
        rr.status,
        rr.establishment_id,
        ra.name as area_name,
        COALESCE(p.name, b.name) as establishment_name,
        rr.created_at
      FROM restaurant_reservations rr
      LEFT JOIN restaurant_areas ra ON rr.area_id = ra.id
      LEFT JOIN places p ON rr.establishment_id = p.id
      LEFT JOIN bars b ON rr.establishment_id = b.id
      WHERE rr.client_name LIKE '%Leo%' 
         OR rr.client_name LIKE '%Cury%'
         OR rr.client_name LIKE '%LEO%'
         OR rr.client_name LIKE '%CURY%'
      ORDER BY rr.created_at DESC
    `);

    if (normalReservations.length > 0) {
      console.log(`✅ Encontradas ${normalReservations.length} reserva(s) normal(is):\n`);
      normalReservations.forEach((res, idx) => {
        console.log(`${idx + 1}. ID: ${res.id}`);
        console.log(`   Nome: ${res.client_name}`);
        console.log(`   Telefone: ${res.client_phone || 'N/A'}`);
        console.log(`   Data: ${res.reservation_date}`);
        console.log(`   Hora: ${res.reservation_time}`);
        console.log(`   Pessoas: ${res.number_of_people}`);
        console.log(`   Status: ${res.status} ⚠️`);
        console.log(`   Estabelecimento: ${res.establishment_name} (ID: ${res.establishment_id})`);
        console.log(`   Área: ${res.area_name || 'N/A'}`);
        console.log(`   Criado em: ${res.created_at}`);
        console.log('   ───────────────────────────────────');
      });
    } else {
      console.log('❌ Nenhuma reserva normal encontrada com "Leo" ou "Cury"\n');
    }

    // 2. Buscar em reservas grandes
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 RESERVAS GRANDES (large_reservations)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const [largeReservations] = await connection.execute(`
      SELECT 
        lr.id,
        lr.client_name,
        lr.client_phone,
        lr.reservation_date,
        lr.reservation_time,
        lr.number_of_people,
        lr.status,
        lr.establishment_id,
        ra.name as area_name,
        COALESCE(p.name, b.name) as establishment_name,
        lr.created_at
      FROM large_reservations lr
      LEFT JOIN restaurant_areas ra ON lr.area_id = ra.id
      LEFT JOIN places p ON lr.establishment_id = p.id
      LEFT JOIN bars b ON lr.establishment_id = b.id
      WHERE lr.client_name LIKE '%Leo%' 
         OR lr.client_name LIKE '%Cury%'
         OR lr.client_name LIKE '%LEO%'
         OR lr.client_name LIKE '%CURY%'
      ORDER BY lr.created_at DESC
    `);

    if (largeReservations.length > 0) {
      console.log(`✅ Encontradas ${largeReservations.length} reserva(s) grande(s):\n`);
      largeReservations.forEach((res, idx) => {
        console.log(`${idx + 1}. ID: ${res.id}`);
        console.log(`   Nome: ${res.client_name}`);
        console.log(`   Telefone: ${res.client_phone || 'N/A'}`);
        console.log(`   Data: ${res.reservation_date}`);
        console.log(`   Hora: ${res.reservation_time}`);
        console.log(`   Pessoas: ${res.number_of_people}`);
        console.log(`   Status: ${res.status} ⚠️`);
        console.log(`   Estabelecimento: ${res.establishment_name} (ID: ${res.establishment_id})`);
        console.log(`   Área: ${res.area_name || 'N/A'}`);
        console.log(`   Criado em: ${res.created_at}`);
        console.log('   ───────────────────────────────────');
      });
    } else {
      console.log('❌ Nenhuma reserva grande encontrada com "Leo" ou "Cury"\n');
    }

    // 3. Análise de status
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 ANÁLISE DE STATUS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const allReservations = [...normalReservations, ...largeReservations];
    
    if (allReservations.length > 0) {
      const statusCounts = allReservations.reduce((acc, res) => {
        acc[res.status] = (acc[res.status] || 0) + 1;
        return acc;
      }, {});

      console.log('Status encontrados:');
      Object.entries(statusCounts).forEach(([status, count]) => {
        const emoji = ['cancelled', 'CANCELADA'].includes(status) ? '❌' : '✅';
        const warning = ['cancelled', 'CANCELADA'].includes(status) ? ' ⚠️ SERÁ EXCLUÍDA DO CALENDÁRIO' : '';
        console.log(`  ${emoji} ${status}: ${count} reserva(s)${warning}`);
      });

      console.log('\n🔍 DIAGNÓSTICO:');
      const hasCancelled = allReservations.some(res => 
        ['cancelled', 'CANCELADA'].includes(res.status)
      );
      
      if (hasCancelled) {
        console.log('  ⚠️ PROBLEMA IDENTIFICADO:');
        console.log('  A reserva do Leo Cury está com status CANCELADA!');
        console.log('  Por isso ela NÃO aparece no calendário.');
        console.log('  \n  SOLUÇÕES:');
        console.log('  1. Alterar o status da reserva para "confirmed" ou "pending"');
        console.log('  2. Ou usar ?include_cancelled=true na API para ver canceladas');
      } else {
        console.log('  ✅ Status OK - Reserva deveria aparecer no calendário');
        console.log('  Se não aparece, pode ser problema de:');
        console.log('  - Formato de data');
        console.log('  - Fuso horário (timezone)');
        console.log('  - Estabelecimento selecionado diferente');
      }
    }

  } catch (error) {
    console.error('❌ Erro ao executar debug:', error);
    console.error('\nDetalhes:', error.message);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Conexão fechada.');
    }
  }
}

// Executar o debug
console.log('\n🔍 INICIANDO DEBUG - RESERVAS DO LEO CURY\n');
debugLeoCuryReservations();


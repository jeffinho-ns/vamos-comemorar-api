// Script para encontrar a reserva da Stephanie Camargo Feital de Lemos
const pool = require('../config/database');

async function findStephanieReservation() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Buscando reserva da Stephanie Camargo Feital de Lemos...\n');
    
    // Buscar por email
    const email = 'stephanie.camargo21@outlook.com';
    
    const searchResult = await client.query(
      `SELECT 
        rr.id,
        rr.client_name,
        rr.client_email,
        rr.client_phone,
        rr.reservation_date,
        rr.reservation_time,
        rr.number_of_people,
        rr.notes,
        rr.status,
        rr.establishment_id,
        rr.area_id,
        rr.table_number,
        COALESCE(p.name, b.name) as establishment_name,
        ra.name as area_name
      FROM restaurant_reservations rr
      LEFT JOIN places p ON rr.establishment_id = p.id
      LEFT JOIN bars b ON rr.establishment_id = b.id
      LEFT JOIN restaurant_areas ra ON rr.area_id = ra.id
      WHERE LOWER(rr.client_email) = LOWER($1)
         OR LOWER(rr.client_name) LIKE LOWER($2)
      ORDER BY rr.reservation_date DESC, rr.id DESC
      LIMIT 20`,
      [email, '%stephanie%camargo%']
    );
    
    if (searchResult.rows.length === 0) {
      console.log('❌ Nenhuma reserva encontrada para:');
      console.log(`   Email: ${email}`);
      console.log(`   Nome: Stephanie Camargo\n`);
      
      // Tentar buscar por nome apenas
      const searchResult2 = await client.query(
        `SELECT 
          rr.id,
          rr.client_name,
          rr.client_email,
          rr.reservation_date,
          rr.notes,
          COALESCE(p.name, b.name) as establishment_name
        FROM restaurant_reservations rr
        LEFT JOIN places p ON rr.establishment_id = p.id
        LEFT JOIN bars b ON rr.establishment_id = b.id
        WHERE LOWER(rr.client_name) LIKE LOWER($1)
        ORDER BY rr.reservation_date DESC
        LIMIT 10`,
        ['%stephanie%']
      );
      
      if (searchResult2.rows.length > 0) {
        console.log('⚠️  Encontradas reservas com nome similar:');
        searchResult2.rows.forEach((r, idx) => {
          console.log(`\n${idx + 1}. Reserva ID: ${r.id}`);
          console.log(`   Nome: ${r.client_name}`);
          console.log(`   Email: ${r.client_email || '(não informado)'}`);
          console.log(`   Data: ${r.reservation_date}`);
          console.log(`   Estabelecimento: ${r.establishment_name || 'Não informado'}`);
        });
      }
      
      return;
    }
    
    console.log(`✅ Encontradas ${searchResult.rows.length} reserva(s):\n`);
    
    searchResult.rows.forEach((r, idx) => {
      console.log(`${idx + 1}. Reserva ID: ${r.id}`);
      console.log(`   Nome: ${r.client_name}`);
      console.log(`   Email: ${r.client_email}`);
      console.log(`   Telefone: ${r.client_phone || '(não informado)'}`);
      console.log(`   Data: ${r.reservation_date}`);
      console.log(`   Horário: ${r.reservation_time}`);
      console.log(`   Pessoas: ${r.number_of_people}`);
      console.log(`   Status: ${r.status}`);
      console.log(`   Estabelecimento: ${r.establishment_name || 'Não informado'}`);
      console.log(`   Área: ${r.area_name || 'Não informado'}`);
      console.log(`   Mesa: ${r.table_number || 'Não informado'}`);
      console.log(`   Observações: ${r.notes || '(vazio)'}`);
      console.log('');
    });
    
    // Verificar se há reserva para dia 21
    const reservaDia21 = searchResult.rows.find(r => {
      const date = new Date(r.reservation_date);
      return date.getDate() === 21;
    });
    
    if (reservaDia21) {
      console.log('🎯 Reserva encontrada para dia 21:');
      console.log(`   ID: ${reservaDia21.id}`);
      console.log(`   Data: ${reservaDia21.reservation_date}`);
      console.log(`   Estabelecimento: ${reservaDia21.establishment_name}`);
      console.log(`   Observações atuais: ${reservaDia21.notes || '(vazio)'}\n`);
      
      // Perguntar se deseja atualizar
      console.log('💡 Para atualizar esta reserva, execute:');
      console.log(`   node scripts/updateStephanieReservationById.js ${reservaDia21.id}`);
    } else {
      console.log('⚠️  Nenhuma reserva encontrada especificamente para o dia 21.');
      console.log('   Verifique as reservas listadas acima.\n');
    }
    
  } catch (error) {
    console.error('❌ Erro ao buscar reserva:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Executar o script
findStephanieReservation()
  .then(() => {
    console.log('\n✅ Script executado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro ao executar script:', error);
    process.exit(1);
  });

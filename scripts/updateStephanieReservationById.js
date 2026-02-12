// Script para atualizar a reserva da Stephanie pelo ID
const pool = require('../config/database');

const reservationId = process.argv[2];

if (!reservationId) {
  console.log('❌ Por favor, forneça o ID da reserva.');
  console.log('   Uso: node scripts/updateStephanieReservationById.js <ID>');
  process.exit(1);
}

async function updateStephanieReservation() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log(`🔍 Buscando reserva ID: ${reservationId}...\n`);
    
    // Buscar a reserva
    const searchResult = await client.query(
      `SELECT 
        rr.id,
        rr.client_name,
        rr.client_email,
        rr.reservation_date,
        rr.reservation_time,
        rr.notes,
        rr.establishment_id,
        COALESCE(p.name, b.name) as establishment_name
      FROM restaurant_reservations rr
      LEFT JOIN places p ON rr.establishment_id = p.id
      LEFT JOIN bars b ON rr.establishment_id = b.id
      WHERE rr.id = $1`,
      [reservationId]
    );
    
    if (searchResult.rows.length === 0) {
      console.log(`❌ Reserva com ID ${reservationId} não encontrada.`);
      await client.query('ROLLBACK');
      return;
    }
    
    const reservation = searchResult.rows[0];
    console.log('✅ Reserva encontrada:');
    console.log(`   ID: ${reservation.id}`);
    console.log(`   Nome: ${reservation.client_name}`);
    console.log(`   Email: ${reservation.client_email}`);
    console.log(`   Data: ${reservation.reservation_date}`);
    console.log(`   Horário: ${reservation.reservation_time}`);
    console.log(`   Estabelecimento: ${reservation.establishment_name}`);
    console.log(`   Observações atuais: ${reservation.notes || '(vazio)'}\n`);
    
    // Preparar nova observação
    const currentNotes = reservation.notes || '';
    let newNotes = '';
    
    // Verificar se já tem a informação sobre drinks
    if (currentNotes.includes('LIBERE DOIS DRINKS DE CORTESIA')) {
      console.log('⚠️  A reserva já contém informação sobre drinks de cortesia.');
      console.log('   Atualizando observações mesmo assim...\n');
    }
    
    // Construir nova observação
    if (currentNotes.includes('ADMIN autoriza que a reserva foi feita fora do horário')) {
      // Se já tem a parte do ADMIN, verificar se tem drinks
      if (!currentNotes.includes('LIBERE DOIS DRINKS DE CORTESIA')) {
        // Adicionar a parte dos drinks
        if (currentNotes.includes('MESA COBERTA + DOIS BISTROS')) {
          newNotes = currentNotes.replace(
            'MESA COBERTA + DOIS BISTROS',
            'MESA COBERTA + DOIS BISTROS E LIBERE DOIS DRINKS DE CORTESIA PARA A CLIENTE.'
          );
        } else {
          newNotes = currentNotes + ' E LIBERE DOIS DRINKS DE CORTESIA PARA A CLIENTE.';
        }
      } else {
        newNotes = currentNotes; // Já tem tudo
      }
    } else {
      // Construir observação completa
      if (currentNotes.trim()) {
        newNotes = currentNotes.trim() + '\n\n';
      }
      newNotes += 'ADMIN autoriza que a reserva foi feita fora do horário das reservas disponíveis.\n\n';
      newNotes += 'MESA COBERTA + DOIS BISTROS E LIBERE DOIS DRINKS DE CORTESIA PARA A CLIENTE.';
    }
    
    console.log('📝 Nova observação:');
    console.log(newNotes);
    console.log('');
    
    // Atualizar a reserva
    await client.query(
      `UPDATE restaurant_reservations 
       SET notes = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newNotes, reservation.id]
    );
    
    await client.query('COMMIT');
    
    console.log('✅ Reserva atualizada com sucesso!');
    console.log(`\n📋 Resumo da atualização:`);
    console.log(`   Reserva ID: ${reservation.id}`);
    console.log(`   Cliente: ${reservation.client_name}`);
    console.log(`   Data: ${reservation.reservation_date}`);
    console.log(`   Observações atualizadas: Sim`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erro ao atualizar reserva:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Executar o script
updateStephanieReservation()
  .then(() => {
    console.log('\n✅ Script executado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro ao executar script:', error);
    process.exit(1);
  });

/**
 * Script para testar a validação de horário do check-in automático
 * Testa se o check-in é permitido a partir da hora da reserva até o final do dia seguinte
 */

function testTimeValidation() {
  console.log('🧪 Testando validação de horário do check-in automático\n');

  // Função auxiliar para criar data
  const createDate = (dateStr, timeStr = null) => {
    const date = new Date(dateStr);
    if (timeStr) {
      const [hours, minutes] = timeStr.split(':');
      date.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    }
    return date;
  };

  // Função que simula a validação (mesma lógica do backend)
  const validateCheckInTime = (reservationDate, reservationTime, currentTime) => {
    const eventDate = new Date(reservationDate);
    
    if (reservationTime) {
      const [hours, minutes] = reservationTime.split(':');
      eventDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      
      // Permitir check-in a partir da hora da reserva até o final do dia seguinte
      const eventEndTime = new Date(eventDate);
      eventEndTime.setDate(eventEndTime.getDate() + 1);
      eventEndTime.setHours(23, 59, 59, 999);
      
      return currentTime >= eventDate && currentTime <= eventEndTime;
    } else {
      // Sem horário: permitir no dia da reserva e no dia seguinte
      const eventDateOnly = new Date(eventDate);
      eventDateOnly.setHours(0, 0, 0, 0);
      const eventEndDateOnly = new Date(eventDateOnly);
      eventEndDateOnly.setDate(eventEndDateOnly.getDate() + 1);
      eventEndDateOnly.setHours(23, 59, 59, 999);
      
      return currentTime >= eventDateOnly && currentTime <= eventEndDateOnly;
    }
  };

  // Casos de teste
  const tests = [
    {
      name: 'Check-in no horário exato da reserva',
      reservationDate: '2025-01-20',
      reservationTime: '20:00',
      currentTime: createDate('2025-01-20', '20:00'),
      expected: true
    },
    {
      name: 'Check-in 1 hora antes da reserva (deve falhar)',
      reservationDate: '2025-01-20',
      reservationTime: '20:00',
      currentTime: createDate('2025-01-20', '19:00'),
      expected: false
    },
    {
      name: 'Check-in 30 minutos após a reserva',
      reservationDate: '2025-01-20',
      reservationTime: '20:00',
      currentTime: createDate('2025-01-20', '20:30'),
      expected: true
    },
    {
      name: 'Check-in no final do dia da reserva (23:59)',
      reservationDate: '2025-01-20',
      reservationTime: '20:00',
      currentTime: createDate('2025-01-20', '23:59'),
      expected: true
    },
    {
      name: 'Check-in no início do dia seguinte (00:00)',
      reservationDate: '2025-01-20',
      reservationTime: '20:00',
      currentTime: createDate('2025-01-21', '00:00'),
      expected: true
    },
    {
      name: 'Check-in no meio do dia seguinte (12:00)',
      reservationDate: '2025-01-20',
      reservationTime: '20:00',
      currentTime: createDate('2025-01-21', '12:00'),
      expected: true
    },
    {
      name: 'Check-in no final do dia seguinte (23:59)',
      reservationDate: '2025-01-20',
      reservationTime: '20:00',
      currentTime: createDate('2025-01-21', '23:59'),
      expected: true
    },
    {
      name: 'Check-in após o final do dia seguinte (00:00 do dia depois)',
      reservationDate: '2025-01-20',
      reservationTime: '20:00',
      currentTime: createDate('2025-01-22', '00:00'),
      expected: false
    },
    {
      name: 'Check-in sem horário - no dia da reserva',
      reservationDate: '2025-01-20',
      reservationTime: null,
      currentTime: createDate('2025-01-20', '15:00'),
      expected: true
    },
    {
      name: 'Check-in sem horário - no dia seguinte',
      reservationDate: '2025-01-20',
      reservationTime: null,
      currentTime: createDate('2025-01-21', '15:00'),
      expected: true
    },
    {
      name: 'Check-in sem horário - 2 dias depois (deve falhar)',
      reservationDate: '2025-01-20',
      reservationTime: null,
      currentTime: createDate('2025-01-22', '15:00'),
      expected: false
    }
  ];

  let passed = 0;
  let failed = 0;

  tests.forEach((test, index) => {
    const result = validateCheckInTime(
      test.reservationDate,
      test.reservationTime,
      test.currentTime
    );
    
    const status = result === test.expected ? '✅' : '❌';
    const statusText = result === test.expected ? 'PASSOU' : 'FALHOU';
    
    console.log(`${index + 1}. ${test.name}`);
    console.log(`   ${status} ${statusText}`);
    console.log(`   Reserva: ${test.reservationDate} ${test.reservationTime || '(sem horário)'}`);
    console.log(`   Agora: ${test.currentTime.toLocaleString('pt-BR')}`);
    console.log(`   Esperado: ${test.expected ? 'Permitido' : 'Negado'}, Obtido: ${result ? 'Permitido' : 'Negado'}`);
    console.log('');
    
    if (result === test.expected) {
      passed++;
    } else {
      failed++;
    }
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 Resultados: ${passed} passaram, ${failed} falharam`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (failed === 0) {
    console.log('🎉 Todos os testes passaram! A validação está funcionando corretamente.');
  } else {
    console.log('⚠️  Alguns testes falharam. Verifique a lógica de validação.');
  }
}

// Executar testes
testTimeValidation();


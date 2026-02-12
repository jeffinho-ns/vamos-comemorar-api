const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

async function checkReservations28Feb() {
  const client = await pool.connect();
  try {
    console.log('🔍 Verificando reservas para 28/02/2025 no Seu Justino...\n');

    // Primeiro, encontrar o ID do Seu Justino
    const establishmentResult = await pool.query(
      `SELECT id, name FROM places WHERE LOWER(name) LIKE '%seu justino%' AND LOWER(name) NOT LIKE '%pracinha%'`
    );

    if (establishmentResult.rows.length === 0) {
      console.log('❌ Estabelecimento "Seu Justino" não encontrado');
      return;
    }

    const establishment = establishmentResult.rows[0];
    console.log(`✅ Estabelecimento encontrado: ${establishment.name} (ID: ${establishment.id})\n`);

    // Buscar TODAS as reservas para 28/02/2025 (sem filtrar status)
    const allReservationsResult = await pool.query(
      `SELECT 
        id,
        client_name,
        reservation_date,
        reservation_time,
        number_of_people,
        table_number,
        area_id,
        status,
        notes,
        created_at
      FROM restaurant_reservations
      WHERE reservation_date = '2025-02-28'
      AND establishment_id = $1
      ORDER BY reservation_time ASC, id ASC`,
      [establishment.id]
    );

    const allReservations = allReservationsResult.rows;
    console.log(`📊 Total de reservas encontradas (todos os status): ${allReservations.length}\n`);

    // Agrupar por status
    const byStatus = {};
    allReservations.forEach(r => {
      const status = r.status || 'NULL';
      if (!byStatus[status]) {
        byStatus[status] = [];
      }
      byStatus[status].push(r);
    });

    console.log('📋 Reservas agrupadas por status:');
    Object.keys(byStatus).forEach(status => {
      console.log(`\n  ${status}: ${byStatus[status].length} reserva(s)`);
      byStatus[status].forEach(r => {
        console.log(`    - ID ${r.id}: ${r.client_name} | ${r.reservation_time} | Mesa ${r.table_number || 'N/A'} | ${r.number_of_people}p | Status: ${r.status}`);
      });
    });

    // Reservas que BLOQUEIAM mesas (status ativos)
    const activeStatuses = ['confirmed', 'seated', 'checked-in', 'CONFIRMED', 'SEATED', 'CHECKED-IN'];
    const activeReservations = allReservations.filter(r => {
      const status = (r.status || '').toLowerCase();
      return activeStatuses.includes(status);
    });

    console.log(`\n✅ Reservas ATIVAS (bloqueiam mesas): ${activeReservations.length}`);
    activeReservations.forEach(r => {
      console.log(`  - ID ${r.id}: ${r.client_name} | ${r.reservation_time} | Mesa ${r.table_number || 'N/A'} | ${r.number_of_people}p`);
    });

    // Reservas que NÃO bloqueiam mesas
    const inactiveReservations = allReservations.filter(r => {
      const status = (r.status || '').toLowerCase();
      return !activeStatuses.includes(status);
    });

    console.log(`\n❌ Reservas INATIVAS (não bloqueiam mesas): ${inactiveReservations.length}`);
    inactiveReservations.forEach(r => {
      console.log(`  - ID ${r.id}: ${r.client_name} | ${r.reservation_time} | Mesa ${r.table_number || 'N/A'} | Status: ${r.status}`);
    });

    // Verificar mesas únicas ocupadas
    const occupiedTables = new Set();
    activeReservations.forEach(r => {
      if (r.table_number) {
        const tables = String(r.table_number).split(',').map(t => t.trim());
        tables.forEach(t => {
          if (t) occupiedTables.add(t);
        });
      }
    });

    console.log(`\n🪑 Mesas ocupadas (únicas): ${occupiedTables.size}`);
    console.log(`   Mesas: ${Array.from(occupiedTables).sort((a, b) => {
      const numA = parseInt(a) || 0;
      const numB = parseInt(b) || 0;
      return numA - numB;
    }).join(', ')}`);

    // Total de mesas do Seu Justino
    const totalTables = 29;
    const availableTables = totalTables - occupiedTables.size;

    console.log(`\n📊 RESUMO:`);
    console.log(`   Total de mesas: ${totalTables}`);
    console.log(`   Mesas ocupadas: ${occupiedTables.size}`);
    console.log(`   Mesas disponíveis: ${availableTables}`);
    console.log(`   Reservas ativas: ${activeReservations.length}`);
    console.log(`   Reservas inativas: ${inactiveReservations.length}`);

    // Verificar se há reservas duplicadas ou com problemas
    const tableReservations = {};
    activeReservations.forEach(r => {
      if (r.table_number) {
        const tables = String(r.table_number).split(',').map(t => t.trim());
        tables.forEach(t => {
          if (t) {
            if (!tableReservations[t]) {
              tableReservations[t] = [];
            }
            tableReservations[t].push(r);
          }
        });
      }
    });

    console.log(`\n⚠️  Mesas com múltiplas reservas ativas:`);
    let hasConflicts = false;
    Object.keys(tableReservations).forEach(table => {
      if (tableReservations[table].length > 1) {
        hasConflicts = true;
        console.log(`   Mesa ${table}: ${tableReservations[table].length} reservas`);
        tableReservations[table].forEach(r => {
          console.log(`     - ID ${r.id}: ${r.client_name} | ${r.reservation_time}`);
        });
      }
    });

    if (!hasConflicts) {
      console.log(`   Nenhum conflito encontrado`);
    }

  } catch (error) {
    console.error('❌ Erro ao verificar reservas:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkReservations28Feb()
  .then(() => {
    console.log('\n✅ Verificação concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro ao executar script:', error);
    process.exit(1);
  });

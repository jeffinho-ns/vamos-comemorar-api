/**
 * Script para testar quantas reservas e guest lists existem para o evento 49 (Highline)
 * Execute: node scripts/test_evento_49_checkins.js
 */

const { Pool } = require('pg');
require('dotenv').config({ path: '.env' });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function testEvento49() {
  const eventoId = 49;
  
  try {
    console.log('🔍 Testando evento 49 (Highline)...\n');
    
    // 1. Buscar informações do evento
    const eventoResult = await pool.query(`
      SELECT 
        e.id as evento_id,
        e.nome_do_evento as nome,
        TO_CHAR(e.data_do_evento, 'YYYY-MM-DD') as data_evento,
        e.hora_do_evento as horario,
        e.tipo_evento,
        e.id_place,
        e.casa_do_evento,
        COALESCE(CAST(pl.name AS TEXT), CAST(b.name AS TEXT)) as establishment_name
      FROM eventos e
      LEFT JOIN places pl ON e.id_place = pl.id
      LEFT JOIN bars b ON e.id_place = b.id
      WHERE e.id = $1
    `, [eventoId]);
    
    if (eventoResult.rows.length === 0) {
      console.log('❌ Evento não encontrado!');
      return;
    }
    
    const eventoInfo = eventoResult.rows[0];
    let establishment_id = eventoInfo.id_place;
    
    console.log('📋 Informações do Evento:');
    console.log({
      evento_id: eventoInfo.evento_id,
      nome: eventoInfo.nome,
      data_evento: eventoInfo.data_evento,
      horario: eventoInfo.horario,
      id_place: eventoInfo.id_place,
      casa_do_evento: eventoInfo.casa_do_evento,
      establishment_name: eventoInfo.establishment_name
    });
    
    // Se id_place estiver NULL, tentar buscar baseado no casa_do_evento
    if (!establishment_id && eventoInfo.casa_do_evento) {
      console.log('\n🔍 Buscando establishment_id baseado em casa_do_evento...');
      const placeResult = await pool.query(`
        SELECT id FROM places 
        WHERE REPLACE(LOWER(name), ' ', '') = REPLACE(LOWER($1), ' ', '')
        UNION ALL
        SELECT id FROM bars 
        WHERE REPLACE(LOWER(name), ' ', '') = REPLACE(LOWER($1), ' ', '')
        LIMIT 1
      `, [eventoInfo.casa_do_evento]);
      
      if (placeResult.rows.length > 0) {
        establishment_id = placeResult.rows[0].id;
        console.log(`✅ Encontrado establishment_id: ${establishment_id}`);
      }
    }
    
    if (!establishment_id) {
      console.log('❌ Não foi possível determinar establishment_id!');
      return;
    }
    
    eventoInfo.establishment_id = establishment_id;
    
    console.log('\n📊 Verificando reservas no banco...\n');
    
    // 2. Verificar restaurant_reservations
    const restaurantCheck = await pool.query(`
      SELECT 
        COUNT(*) as total_reservations,
        COUNT(CASE WHEN gl.id IS NOT NULL THEN 1 END) as reservas_com_guest_list,
        COUNT(CASE WHEN gl.id IS NULL THEN 1 END) as reservas_sem_guest_list
      FROM restaurant_reservations rr
      LEFT JOIN guest_lists gl ON gl.reservation_id = rr.id AND gl.reservation_type = 'restaurant'
      WHERE rr.establishment_id = $1
      AND rr.reservation_date::DATE = $2::DATE
    `, [establishment_id, eventoInfo.data_evento]);
    
    console.log('🍽️ Restaurant Reservations:');
    console.log({
      total_reservations: restaurantCheck.rows[0]?.total_reservations || 0,
      reservas_com_guest_list: restaurantCheck.rows[0]?.reservas_com_guest_list || 0,
      reservas_sem_guest_list: restaurantCheck.rows[0]?.reservas_sem_guest_list || 0
    });
    
    // 3. Verificar large_reservations
    const largeCheck = await pool.query(`
      SELECT 
        COUNT(*) as total_reservations,
        COUNT(CASE WHEN gl.id IS NOT NULL THEN 1 END) as reservas_com_guest_list,
        COUNT(CASE WHEN gl.id IS NULL THEN 1 END) as reservas_sem_guest_list
      FROM large_reservations lr
      LEFT JOIN guest_lists gl ON gl.reservation_id = lr.id AND gl.reservation_type = 'large'
      WHERE lr.establishment_id = $1
      AND lr.reservation_date::DATE = $2::DATE
    `, [establishment_id, eventoInfo.data_evento]);
    
    console.log('\n🎉 Large Reservations:');
    console.log({
      total_reservations: largeCheck.rows[0]?.total_reservations || 0,
      reservas_com_guest_list: largeCheck.rows[0]?.reservas_com_guest_list || 0,
      reservas_sem_guest_list: largeCheck.rows[0]?.reservas_sem_guest_list || 0
    });
    
    // 4. Buscar guest lists (igual à query do backend)
    const guestListsRestaurant = await pool.query(`
      SELECT 
        gl.id as guest_list_id,
        gl.reservation_type,
        gl.event_type,
        gl.shareable_link_token,
        gl.expires_at,
        gl.owner_checked_in,
        gl.owner_checkin_time,
        gl.owner_checked_out,
        gl.owner_checkout_time,
        CASE WHEN gl.expires_at >= NOW() THEN 1 ELSE 0 END AS is_valid,
        rr.client_name as owner_name,
        rr.id as reservation_id,
        rr.reservation_date,
        rr.reservation_time,
        rr.number_of_people,
        rr.origin,
        rr.table_number,
        rr.checked_in as reservation_checked_in,
        rr.checkin_time as reservation_checkin_time,
        rr.status,
        COALESCE(CAST(u.name AS TEXT), 'Sistema') as created_by_name,
        ra.name as area_name,
        COUNT(DISTINCT g.id) as total_guests,
        SUM(CASE WHEN g.checked_in = TRUE THEN 1 ELSE 0 END) as guests_checked_in
      FROM guest_lists gl
      INNER JOIN restaurant_reservations rr ON gl.reservation_id = rr.id AND gl.reservation_type = 'restaurant'
      LEFT JOIN users u ON rr.created_by = u.id
      LEFT JOIN restaurant_areas ra ON rr.area_id = ra.id
      LEFT JOIN guests g ON gl.id = g.guest_list_id
      WHERE rr.establishment_id = $1
      AND rr.reservation_date::DATE = $2::DATE
      GROUP BY gl.id, gl.reservation_type, gl.event_type, gl.shareable_link_token, gl.expires_at, gl.owner_checked_in, gl.owner_checkin_time, gl.owner_checked_out, gl.owner_checkout_time, rr.client_name, rr.id, rr.reservation_date, rr.reservation_time, rr.number_of_people, rr.origin, rr.table_number, rr.checked_in, rr.checkin_time, rr.status, u.name, ra.name
    `, [establishment_id, eventoInfo.data_evento]);
    
    const guestListsLarge = await pool.query(`
      SELECT 
        gl.id as guest_list_id,
        gl.reservation_type,
        gl.event_type,
        gl.shareable_link_token,
        gl.expires_at,
        gl.owner_checked_in,
        gl.owner_checkin_time,
        gl.owner_checked_out,
        gl.owner_checkout_time,
        CASE WHEN gl.expires_at >= NOW() THEN 1 ELSE 0 END AS is_valid,
        lr.client_name as owner_name,
        lr.id as reservation_id,
        lr.reservation_date,
        lr.reservation_time,
        lr.number_of_people,
        lr.origin,
        NULL as table_number,
        CASE WHEN lr.status = 'CHECKED_IN' THEN 1 ELSE 0 END as reservation_checked_in,
        lr.check_in_time as reservation_checkin_time,
        COALESCE(CAST(u.name AS TEXT), 'Sistema') as created_by_name,
        NULL as area_name,
        COUNT(DISTINCT g.id) as total_guests,
        SUM(CASE WHEN g.checked_in = TRUE THEN 1 ELSE 0 END) as guests_checked_in
      FROM guest_lists gl
      INNER JOIN large_reservations lr ON gl.reservation_id = lr.id AND gl.reservation_type = 'large'
      LEFT JOIN users u ON lr.created_by = u.id
      LEFT JOIN guests g ON gl.id = g.guest_list_id
      WHERE lr.establishment_id = $1
      AND lr.reservation_date::DATE = $2::DATE
      GROUP BY gl.id, gl.reservation_type, gl.event_type, gl.shareable_link_token, gl.expires_at, gl.owner_checked_in, gl.owner_checkin_time, gl.owner_checked_out, gl.owner_checkout_time, lr.client_name, lr.id, lr.reservation_date, lr.reservation_time, lr.number_of_people, lr.origin, lr.status, lr.check_in_time, u.name
    `, [establishment_id, eventoInfo.data_evento]);
    
    const totalGuestLists = guestListsRestaurant.rows.length + guestListsLarge.rows.length;
    
    console.log('\n📋 Guest Lists Encontradas:');
    console.log({
      restaurant_guest_lists: guestListsRestaurant.rows.length,
      large_guest_lists: guestListsLarge.rows.length,
      total_guest_lists: totalGuestLists
    });
    
    if (totalGuestLists > 0) {
      console.log('\n✅ Primeiras 5 guest lists:');
      const allGuestLists = [...guestListsRestaurant.rows, ...guestListsLarge.rows].slice(0, 5);
      allGuestLists.forEach((gl, index) => {
        console.log(`${index + 1}. ${gl.owner_name} - ${gl.reservation_time} - Mesa: ${gl.table_number || 'N/A'}`);
      });
    } else {
      console.log('\n⚠️ Nenhuma guest list encontrada!');
      console.log('\n🔍 Verificando se há reservas sem guest_list...');
      
      const reservasSemGuestList = await pool.query(`
        SELECT rr.id, rr.client_name, rr.reservation_date, rr.reservation_time, rr.table_number
        FROM restaurant_reservations rr
        LEFT JOIN guest_lists gl ON gl.reservation_id = rr.id AND gl.reservation_type = 'restaurant'
        WHERE rr.establishment_id = $1
        AND rr.reservation_date::DATE = $2::DATE
        AND gl.id IS NULL
        LIMIT 10
      `, [establishment_id, eventoInfo.data_evento]);
      
      if (reservasSemGuestList.rows.length > 0) {
        console.log(`\n📝 Encontradas ${reservasSemGuestList.rows.length} reservas SEM guest_list:`);
        reservasSemGuestList.rows.forEach((r, index) => {
          console.log(`${index + 1}. ${r.client_name} - ${r.reservation_time} - Mesa: ${r.table_number || 'N/A'}`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await pool.end();
  }
}

testEvento49();


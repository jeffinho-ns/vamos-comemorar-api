/**
 * Script para testar check-ins do promoter rodtigocogu@highlinebar.com.br no evento de hoje (13/02/2026)
 * Execute: node scripts/test_promoter_checkins_rodtigocogu.js
 */

const pool = require('../config/database');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const PROMOTER_EMAIL = 'rodtigocogu@highlinebar.com.br';
const DATA_HOJE = '2026-02-13'; // 13/02/2026

async function testarCheckins() {
  const client = await pool.connect();

  try {
    await client.query(`SET search_path TO meu_backup_db, public`);
    console.log('🔍 Testando check-ins do promoter:', PROMOTER_EMAIL);
    console.log('📅 Data do evento:', DATA_HOJE);
    console.log('');

    // 1. Buscar promoter pelo email
    const promoterResult = await client.query(
      `SELECT promoter_id, nome, codigo_identificador, email 
       FROM promoters 
       WHERE LOWER(email) = LOWER($1) AND ativo = TRUE
       LIMIT 1`,
      [PROMOTER_EMAIL]
    );

    if (promoterResult.rows.length === 0) {
      console.log('❌ Promoter não encontrado com email:', PROMOTER_EMAIL);
      return;
    }

    const promoter = promoterResult.rows[0];
    console.log('✅ Promoter encontrado:');
    console.log('   ID:', promoter.promoter_id);
    console.log('   Nome:', promoter.nome);
    console.log('   Código:', promoter.codigo_identificador || '(não definido)');
    console.log('   Email:', promoter.email);
    console.log('');

    const promoterId = promoter.promoter_id;

    // 2. Buscar eventos do promoter para hoje (13/02/2026)
    const eventosResult = await client.query(
      `SELECT pe.evento_id, pe.data_evento, TO_CHAR(pe.data_evento, 'YYYY-MM-DD') as data_evento_str, e.nome_do_evento
       FROM promoter_eventos pe
       INNER JOIN eventos e ON e.id = pe.evento_id
       WHERE pe.promoter_id = $1 
       AND pe.data_evento::DATE = $2::DATE
       AND (pe.status IS NULL OR pe.status::TEXT ILIKE '%ativo%')
       ORDER BY pe.data_evento ASC`,
      [promoterId, DATA_HOJE]
    );

    if (eventosResult.rows.length === 0) {
      console.log('⚠️ Nenhum evento atrelado ao promoter para a data', DATA_HOJE);
      console.log('   Buscando todos os eventos do promoter...');
      const todosEventos = await client.query(
        `SELECT pe.evento_id, pe.data_evento, TO_CHAR(pe.data_evento, 'YYYY-MM-DD') as data_evento_str, e.nome_do_evento
         FROM promoter_eventos pe
         INNER JOIN eventos e ON e.id = pe.evento_id
         WHERE pe.promoter_id = $1
         AND (pe.status IS NULL OR pe.status::TEXT ILIKE '%ativo%')
         ORDER BY pe.data_evento DESC
         LIMIT 10`,
        [promoterId]
      );
      if (todosEventos.rows.length > 0) {
        console.log('   Eventos recentes do promoter:');
        todosEventos.rows.forEach((ev, i) => {
          console.log(`   ${i + 1}. ${ev.nome_do_evento} - ${ev.data_evento_str} (evento_id: ${ev.evento_id})`);
        });
      }
    }

    const eventos = eventosResult.rows;
    console.log('');
    console.log(`📋 Eventos do promoter para ${DATA_HOJE}:`, eventos.length);
    console.log('');

    // 3. Para cada evento, contar check-ins (mesma lógica da API)
    for (const ev of eventos) {
      const eventoId = ev.evento_id;
      const dataEventoStr = ev.data_evento_str || DATA_HOJE;
      console.log(`--- Evento: ${ev.nome_do_evento} (ID: ${eventoId}, Data: ${dataEventoStr}) ---`);

      // Query idêntica à API promoterPublic
      const checkinsRes = await client.query(
        `SELECT COUNT(DISTINCT lc.lista_convidado_id) as total_checkins
         FROM listas_convidados lc
         INNER JOIN listas l ON lc.lista_id = l.lista_id
         LEFT JOIN promoter_eventos pe ON pe.promoter_id = l.promoter_responsavel_id AND pe.evento_id = $2
         WHERE l.promoter_responsavel_id = $1
         AND (l.evento_id = $2 OR (l.evento_id IS NULL AND pe.evento_id = $2))
         AND lc.status_checkin = 'Check-in'
         AND lc.data_checkin IS NOT NULL
         AND (
           $3::DATE IS NULL
           OR (
             (lc.data_checkin::timestamptz AT TIME ZONE 'America/Sao_Paulo')::DATE = $3::DATE
             OR lc.data_checkin::DATE = $3::DATE
           )
         )`,
        [promoterId, eventoId, dataEventoStr]
      );

      const totalCheckins = parseInt(checkinsRes.rows[0]?.total_checkins || 0);
      console.log(`   Check-ins (query API): ${totalCheckins}`);
      console.log('');

      // 4. Debug: listar listas do promoter para este evento
      const listasRes = await client.query(
        `SELECT l.lista_id, l.nome, l.evento_id, l.promoter_responsavel_id
         FROM listas l
         WHERE l.promoter_responsavel_id = $1
         AND (l.evento_id = $2 OR l.evento_id IS NULL)`,
        [promoterId, eventoId]
      );

      console.log(`   Listas do promoter para evento ${eventoId}:`, listasRes.rows.length);
      listasRes.rows.forEach((lista, i) => {
        console.log(`      ${i + 1}. lista_id=${lista.lista_id} nome="${lista.nome}" evento_id=${lista.evento_id}`);
      });
      console.log('');

      // 5. Debug: contar TODOS os check-ins nas listas do promoter (sem filtro de data)
      const checkinsSemFiltroRes = await client.query(
        `SELECT COUNT(DISTINCT lc.lista_convidado_id) as total,
                MIN(lc.data_checkin) as primeiro_checkin,
                MAX(lc.data_checkin) as ultimo_checkin
         FROM listas_convidados lc
         INNER JOIN listas l ON lc.lista_id = l.lista_id
         WHERE l.promoter_responsavel_id = $1
         AND (l.evento_id = $2 OR (l.evento_id IS NULL AND EXISTS (
           SELECT 1 FROM promoter_eventos pe 
           WHERE pe.promoter_id = $1 AND pe.evento_id = $2
         )))
         AND lc.status_checkin = 'Check-in'
         AND lc.data_checkin IS NOT NULL`,
        [promoterId, eventoId]
      );

      const row = checkinsSemFiltroRes.rows[0];
      console.log(`   Check-ins totais (sem filtro de data): ${row?.total || 0}`);
      if (row?.primeiro_checkin) {
        console.log(`   Primeiro check-in: ${row.primeiro_checkin}`);
        console.log(`   Último check-in:  ${row.ultimo_checkin}`);
        // Mostrar data em São Paulo
        if (row.primeiro_checkin) {
          const dt = new Date(row.primeiro_checkin);
          const dtSP = new Date(dt.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
          console.log(`   Primeiro check-in (SP): ${dtSP.toISOString()}`);
        }
      }
      console.log('');

      // 6. Listar check-ins individuais para debug
      const detalhesRes = await client.query(
        `SELECT lc.lista_convidado_id, lc.nome_convidado, lc.data_checkin, lc.status_checkin
         FROM listas_convidados lc
         INNER JOIN listas l ON lc.lista_id = l.lista_id
         WHERE l.promoter_responsavel_id = $1
         AND (l.evento_id = $2 OR (l.evento_id IS NULL AND EXISTS (
           SELECT 1 FROM promoter_eventos pe 
           WHERE pe.promoter_id = $1 AND pe.evento_id = $2
         )))
         AND lc.status_checkin = 'Check-in'
         AND lc.data_checkin IS NOT NULL
         ORDER BY lc.data_checkin
         LIMIT 15`,
        [promoterId, eventoId]
      );

      if (detalhesRes.rows.length > 0) {
        console.log(`   Detalhes dos check-ins (primeiros 15):`);
        detalhesRes.rows.forEach((c, i) => {
          const dtSP = c.data_checkin ? new Date(c.data_checkin).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'N/A';
          const dtUTC = c.data_checkin ? new Date(c.data_checkin).toISOString() : 'N/A';
          console.log(`      ${i + 1}. ${c.nome_convidado} | data_checkin (SP): ${dtSP} | UTC: ${dtUTC}`);
        });
      }
      console.log('');
    }

    if (eventos.length === 0) {
      console.log('❌ Nenhum evento encontrado para testar. Verifique se o promoter está vinculado a algum evento na data', DATA_HOJE);
    }

    console.log('✅ Teste concluído.');
  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

testarCheckins();

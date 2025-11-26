// Script para diagnosticar por que um convidado de promoter não aparece na página de check-ins
// Execute: node scripts/debug_convidado_promoter.js [evento_id] [promoter_id]

const pool = require('../config/database');

async function debugConvidado(eventoId, promoterId = null) {
  console.log('🔍 Diagnosticando convidados de promoters para o evento:', eventoId, '\n');
  
  try {
    // 1. Verificar se o evento existe
    const eventoResult = await pool.query('SELECT * FROM eventos WHERE id = $1', [eventoId]);
    if (eventoResult.rows.length === 0) {
      console.log('❌ Evento não encontrado!');
      return;
    }
    const evento = eventoResult.rows[0];
    console.log('✅ Evento encontrado:', evento.nome_do_evento, '- Data:', evento.data_do_evento);
    console.log('');
    
    // 2. Buscar todos os promoters vinculados ao evento
    console.log('📋 Promoters vinculados ao evento:');
    const promotersEventoResult = await pool.query(`
      SELECT pe.*, p.nome as promoter_nome 
      FROM promoter_eventos pe
      JOIN promoters p ON pe.promoter_id = p.promoter_id
      WHERE pe.evento_id = $1
    `, [eventoId]);
    
    console.log(`   Total: ${promotersEventoResult.rows.length}`);
    promotersEventoResult.rows.forEach(pe => {
      console.log(`   - ${pe.promoter_nome} (ID: ${pe.promoter_id}, Status: ${pe.status})`);
    });
    console.log('');
    
    // 3. Buscar todas as listas dos promoters vinculados ao evento
    console.log('📋 Listas dos promoters:');
    let listasQuery = `
      SELECT l.*, p.nome as promoter_nome
      FROM listas l
      JOIN promoters p ON l.promoter_responsavel_id = p.promoter_id
      WHERE EXISTS (
        SELECT 1 FROM promoter_eventos pe 
        WHERE pe.promoter_id = l.promoter_responsavel_id 
        AND pe.evento_id = $1
      )
    `;
    let listasParams = [eventoId];
    
    if (promoterId) {
      listasQuery += ` AND l.promoter_responsavel_id = $2`;
      listasParams.push(promoterId);
    }
    
    const listasResult = await pool.query(listasQuery, listasParams);
    console.log(`   Total de listas: ${listasResult.rows.length}`);
    listasResult.rows.forEach(l => {
      console.log(`   - Lista ID: ${l.lista_id}, Nome: ${l.nome}`);
      console.log(`     Promoter: ${l.promoter_nome}, Evento ID: ${l.evento_id || 'NULL'}`);
    });
    console.log('');
    
    // 4. Buscar todos os convidados dessas listas
    console.log('👥 Convidados nas listas:');
    if (listasResult.rows.length > 0) {
      const listaIds = listasResult.rows.map(l => l.lista_id);
      const convidadosResult = await pool.query(`
        SELECT lc.*, l.nome as lista_nome, l.evento_id as lista_evento_id, p.nome as promoter_nome
        FROM listas_convidados lc
        JOIN listas l ON lc.lista_id = l.lista_id
        JOIN promoters p ON l.promoter_responsavel_id = p.promoter_id
        WHERE lc.lista_id = ANY($1)
        ORDER BY lc.created_at DESC
        LIMIT 20
      `, [listaIds]);
      
      console.log(`   Total de convidados encontrados: ${convidadosResult.rows.length}`);
      convidadosResult.rows.forEach(c => {
        console.log(`   - ${c.nome_convidado} (Lista: ${c.lista_nome}, Evento ID: ${c.lista_evento_id || 'NULL'})`);
      });
    } else {
      console.log('   ⚠️ Nenhuma lista encontrada!');
    }
    console.log('');
    
    // 5. Buscar usando a query atual do endpoint
    console.log('🔍 Buscando com a query do endpoint getCheckinsConsolidados:');
    const queryResult = await pool.query(`
      SELECT DISTINCT
        lc.lista_convidado_id as id,
        lc.nome_convidado as nome,
        l.nome as origem,
        p.nome as responsavel,
        l.evento_id as lista_evento_id,
        pe.evento_id as promoter_evento_id
      FROM listas_convidados lc
      INNER JOIN listas l ON lc.lista_id = l.lista_id
      LEFT JOIN promoters p ON l.promoter_responsavel_id = p.promoter_id
      LEFT JOIN promoter_eventos pe ON pe.promoter_id = p.promoter_id AND pe.evento_id = $1
      WHERE 
        l.evento_id = $1
        OR (pe.evento_id = $1)
        OR ($2::DATE IS NOT NULL AND l.evento_id IS NULL AND COALESCE(l.created_at::DATE, CURRENT_DATE) = $2::DATE)
      ORDER BY lc.nome_convidado ASC
    `, [eventoId, evento.data_do_evento || null]);
    
    console.log(`   Total encontrado pela query: ${queryResult.rows.length}`);
    queryResult.rows.forEach(c => {
      console.log(`   - ${c.nome} (Lista evento: ${c.lista_evento_id || 'NULL'}, Promoter evento: ${c.promoter_evento_id || 'NULL'})`);
    });
    
  } catch (error) {
    console.error('❌ Erro:', error);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

// Executar
const eventoId = process.argv[2];
const promoterId = process.argv[3] || null;

if (!eventoId) {
  console.log('❌ Por favor, forneça o ID do evento:');
  console.log('   node scripts/debug_convidado_promoter.js [evento_id] [promoter_id (opcional)]');
  process.exit(1);
}

debugConvidado(eventoId, promoterId)
  .then(() => {
    console.log('\n✅ Diagnóstico concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro no diagnóstico:', error);
    process.exit(1);
  });

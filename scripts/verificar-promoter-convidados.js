// Script para verificar convidados do promoter Highline
// Execute com: node scripts/verificar-promoter-convidados.js

require('dotenv').config();
const pool = require('../config/database');

async function verificarPromoterConvidados() {
  try {
    console.log('🔍 Verificando convidados do promoter Highline...\n');
    
    // 1. Buscar promoter Highline
    console.log('1️⃣ Buscando promoter...');
    const [promoters] = await pool.execute(`
      SELECT * FROM promoters 
      WHERE codigo_identificador = 'highlinepromo' OR nome LIKE '%Highline%'
    `);
    
    if (promoters.length === 0) {
      console.log('❌ Promoter Highline não encontrado!');
      return;
    }
    
    const promoter = promoters[0];
    console.log('✅ Promoter encontrado:', promoter.nome);
    console.log('   - ID:', promoter.promoter_id);
    console.log('   - Código:', promoter.codigo_identificador);
    console.log('   - Status:', promoter.status);
    console.log('');
    
    // 2. Buscar convidados na tabela promoter_convidados
    console.log('2️⃣ Buscando convidados na tabela promoter_convidados...');
    const [convidadosPromoter] = await pool.execute(`
      SELECT 
        pc.*,
        e.nome_do_evento as evento_nome,
        e.id as evento_id
      FROM promoter_convidados pc
      LEFT JOIN eventos e ON pc.evento_id = e.id
      WHERE pc.promoter_id = ?
      ORDER BY pc.created_at DESC
    `, [promoter.promoter_id]);
    
    console.log(`✅ ${convidadosPromoter.length} convidado(s) encontrado(s) na tabela promoter_convidados:`);
    
    if (convidadosPromoter.length > 0) {
      convidadosPromoter.forEach((c, i) => {
        if (i < 10) { // Mostrar até 10
          console.log(`   ${i+1}. ${c.nome}`);
          console.log(`      - WhatsApp: ${c.whatsapp || 'N/A'}`);
          console.log(`      - Status: ${c.status}`);
          console.log(`      - Evento: ${c.evento_nome || 'Nenhum'} (ID: ${c.evento_id || 'N/A'})`);
          console.log(`      - Data: ${c.created_at}`);
          console.log('');
        }
      });
      
      if (convidadosPromoter.length > 10) {
        console.log(`   ... e mais ${convidadosPromoter.length - 10} convidado(s)`);
        console.log('');
      }
    }
    
    // 3. Buscar listas do promoter
    console.log('3️⃣ Buscando listas do promoter...');
    const [listas] = await pool.execute(`
      SELECT 
        l.*,
        e.nome_do_evento as evento_nome
      FROM listas l
      LEFT JOIN eventos e ON l.evento_id = e.id
      WHERE l.promoter_responsavel_id = ?
    `, [promoter.promoter_id]);
    
    console.log(`✅ ${listas.length} lista(s) encontrada(s):`);
    
    if (listas.length > 0) {
      for (const lista of listas) {
        console.log(`   📋 ${lista.nome} (ID: ${lista.lista_id})`);
        console.log(`      - Evento: ${lista.evento_nome || 'N/A'} (ID: ${lista.evento_id})`);
        console.log(`      - Tipo: ${lista.tipo}`);
        
        // Contar convidados nesta lista
        const [count] = await pool.execute(`
          SELECT COUNT(*) as total FROM listas_convidados WHERE lista_id = ?
        `, [lista.lista_id]);
        
        console.log(`      - Convidados na tabela listas_convidados: ${count[0].total}`);
        console.log('');
      }
    }
    
    // 4. Verificar relacionamento promoter-evento
    console.log('4️⃣ Verificando relacionamento promoter-evento...');
    const [relacionamentos] = await pool.execute(`
      SELECT 
        pe.*,
        e.nome_do_evento as evento_nome
      FROM promoter_eventos pe
      LEFT JOIN eventos e ON pe.evento_id = e.id
      WHERE pe.promoter_id = ?
    `, [promoter.promoter_id]);
    
    console.log(`✅ ${relacionamentos.length} relacionamento(s) encontrado(s):`);
    
    if (relacionamentos.length > 0) {
      relacionamentos.forEach((r, i) => {
        console.log(`   ${i+1}. Evento: ${r.evento_nome} (ID: ${r.evento_id})`);
        console.log(`      - Status: ${r.status}`);
        console.log(`      - Função: ${r.funcao}`);
        console.log('');
      });
    }
    
    console.log('\n✅ Diagnóstico concluído!');
    console.log('\n📊 RESUMO:');
    console.log(`   - Convidados na tabela promoter_convidados: ${convidadosPromoter.length}`);
    console.log(`   - Listas criadas: ${listas.length}`);
    console.log(`   - Relacionamentos com eventos: ${relacionamentos.length}`);
    
    // Contar total de convidados nas listas
    const [totalListas] = await pool.execute(`
      SELECT COUNT(*) as total
      FROM listas_convidados lc
      INNER JOIN listas l ON lc.lista_id = l.lista_id
      WHERE l.promoter_responsavel_id = ?
    `, [promoter.promoter_id]);
    
    console.log(`   - Convidados nas listas (tabela listas_convidados): ${totalListas[0].total}`);
    
    if (convidadosPromoter.length > 0 && totalListas[0].total === 0) {
      console.log('\n⚠️  PROBLEMA IDENTIFICADO:');
      console.log('   Os convidados estão na tabela promoter_convidados,');
      console.log('   mas não estão na tabela listas_convidados!');
      console.log('   É necessário migrar/sincronizar os dados.');
    }
    
  } catch (error) {
    console.error('❌ Erro ao verificar:', error);
    console.error(error.stack);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

verificarPromoterConvidados();











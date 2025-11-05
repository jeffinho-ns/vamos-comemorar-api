// Script para testar se há listas e convidados no banco
// Execute com: node scripts/testar-listas-convidados.js

require('dotenv').config();
const pool = require('../config/database');

async function testarListasConvidados() {
  try {
    console.log('🔍 Testando listas e convidados no banco...\n');
    
    // 1. Buscar evento 28
    console.log('1️⃣ Buscando evento ID 28...');
    const [eventos] = await pool.execute(`
      SELECT * FROM eventos WHERE id = 28
    `);
    
    if (eventos.length === 0) {
      console.log('❌ Evento 28 não encontrado!');
      return;
    }
    
    console.log('✅ Evento encontrado:', eventos[0].nome_do_evento);
    console.log('   - Tipo:', eventos[0].tipo_evento);
    console.log('   - Usado para listas:', eventos[0].usado_para_listas ? 'Sim' : 'Não');
    console.log('');
    
    // 2. Buscar listas do evento 28
    console.log('2️⃣ Buscando listas do evento 28...');
    const [listas] = await pool.execute(`
      SELECT 
        l.*,
        p.nome as promoter_nome,
        COUNT(DISTINCT lc.lista_convidado_id) as total_convidados
      FROM listas l
      LEFT JOIN promoters p ON l.promoter_responsavel_id = p.promoter_id
      LEFT JOIN listas_convidados lc ON l.lista_id = lc.lista_id
      WHERE l.evento_id = 28
      GROUP BY l.lista_id
    `);
    
    if (listas.length === 0) {
      console.log('❌ Nenhuma lista encontrada para o evento 28!');
      console.log('');
      
      // Verificar se há listas em geral
      const [todasListas] = await pool.execute(`
        SELECT evento_id, COUNT(*) as total
        FROM listas
        GROUP BY evento_id
        ORDER BY total DESC
        LIMIT 10
      `);
      
      console.log('📊 Eventos com mais listas:');
      todasListas.forEach(e => {
        console.log(`   - Evento ${e.evento_id}: ${e.total} lista(s)`);
      });
      
      return;
    }
    
    console.log(`✅ ${listas.length} lista(s) encontrada(s):`);
    console.log('');
    
    // 3. Para cada lista, buscar convidados
    for (const lista of listas) {
      console.log(`📋 Lista: ${lista.nome} (ID: ${lista.lista_id})`);
      console.log(`   - Tipo: ${lista.tipo}`);
      console.log(`   - Promoter: ${lista.promoter_nome || 'Sem promoter'}`);
      console.log(`   - Total convidados: ${lista.total_convidados}`);
      
      // Buscar convidados da lista
      const [convidados] = await pool.execute(`
        SELECT 
          lista_convidado_id,
          nome_convidado,
          telefone_convidado,
          status_checkin,
          is_vip
        FROM listas_convidados
        WHERE lista_id = ?
        ORDER BY nome_convidado
        LIMIT 5
      `, [lista.lista_id]);
      
      if (convidados.length > 0) {
        console.log(`   ✅ Convidados (mostrando até 5):`);
        convidados.forEach(c => {
          console.log(`      - ${c.nome_convidado} (${c.status_checkin})${c.is_vip ? ' ⭐ VIP' : ''}`);
        });
        
        if (lista.total_convidados > 5) {
          console.log(`      ... e mais ${lista.total_convidados - 5} convidado(s)`);
        }
      } else {
        console.log(`   ❌ Nenhum convidado encontrado nesta lista`);
      }
      
      console.log('');
    }
    
    // 4. Verificar se há convidados órfãos (sem lista)
    console.log('4️⃣ Verificando convidados sem lista...');
    const [convidadosOrfaos] = await pool.execute(`
      SELECT 
        lc.lista_convidado_id,
        lc.lista_id,
        lc.nome_convidado
      FROM listas_convidados lc
      LEFT JOIN listas l ON lc.lista_id = l.lista_id
      WHERE l.lista_id IS NULL
      LIMIT 5
    `);
    
    if (convidadosOrfaos.length > 0) {
      console.log(`⚠️  ${convidadosOrfaos.length} convidado(s) sem lista encontrado(s):`);
      convidadosOrfaos.forEach(c => {
        console.log(`   - ${c.nome_convidado} (lista_id: ${c.lista_id} não existe)`);
      });
    } else {
      console.log('✅ Não há convidados órfãos');
    }
    
    console.log('\n✅ Teste concluído!');
    
  } catch (error) {
    console.error('❌ Erro ao testar:', error);
    console.error(error.stack);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

testarListasConvidados();








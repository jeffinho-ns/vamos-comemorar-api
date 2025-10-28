// Script para migrar convidados de promoter_convidados para listas_convidados
// Execute com: node scripts/migrar-convidados-para-listas.js

require('dotenv').config();
const pool = require('../config/database');

async function migrarConvidados() {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    console.log('🔄 Iniciando migração de convidados...\n');
    
    // 1. Buscar todos os promoters que têm listas e convidados
    const [promotersComListas] = await connection.execute(`
      SELECT DISTINCT
        p.promoter_id,
        p.nome as promoter_nome,
        l.lista_id,
        l.nome as lista_nome,
        l.evento_id
      FROM promoters p
      INNER JOIN listas l ON p.promoter_id = l.promoter_responsavel_id
      WHERE p.status = 'Ativo'
      ORDER BY p.promoter_id
    `);
    
    console.log(`📊 Encontrados ${promotersComListas.length} promoter(s) com listas\n`);
    
    let totalMigrados = 0;
    let totalJaExistentes = 0;
    
    for (const { promoter_id, promoter_nome, lista_id, lista_nome, evento_id } of promotersComListas) {
      console.log(`👤 Processando: ${promoter_nome} - Lista: ${lista_nome}`);
      
      // Buscar convidados deste promoter para este evento
      const [convidadosPromoter] = await connection.execute(`
        SELECT *
        FROM promoter_convidados
        WHERE promoter_id = ?
        AND (evento_id = ? OR evento_id IS NULL)
        ORDER BY created_at DESC
      `, [promoter_id, evento_id]);
      
      console.log(`   📋 ${convidadosPromoter.length} convidado(s) encontrado(s) na tabela promoter_convidados`);
      
      if (convidadosPromoter.length === 0) {
        console.log('   ⏭️  Pulando - sem convidados\n');
        continue;
      }
      
      let migradosNesta = 0;
      let jaExistentesNesta = 0;
      
      for (const convidado of convidadosPromoter) {
        // Verificar se já existe na lista
        const [existente] = await connection.execute(`
          SELECT lista_convidado_id
          FROM listas_convidados
          WHERE lista_id = ?
          AND nome_convidado = ?
          AND telefone_convidado = ?
        `, [lista_id, convidado.nome, convidado.whatsapp]);
        
        if (existente.length > 0) {
          jaExistentesNesta++;
          continue;
        }
        
        // Mapear status
        let statusCheckin = 'Pendente';
        if (convidado.status === 'confirmado') {
          statusCheckin = 'Check-in';
        } else if (convidado.status === 'cancelado') {
          statusCheckin = 'No-Show';
        }
        
        // Inserir na tabela listas_convidados
        await connection.execute(`
          INSERT INTO listas_convidados (
            lista_id,
            nome_convidado,
            telefone_convidado,
            email_convidado,
            status_checkin,
            is_vip,
            observacoes,
            data_checkin,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          lista_id,
          convidado.nome,
          convidado.whatsapp,
          convidado.email || null,
          statusCheckin,
          false, // is_vip - pode ser ajustado se houver lógica específica
          null,
          statusCheckin === 'Check-in' ? convidado.updated_at : null,
          convidado.created_at
        ]);
        
        migradosNesta++;
      }
      
      console.log(`   ✅ Migrados: ${migradosNesta}`);
      if (jaExistentesNesta > 0) {
        console.log(`   ℹ️  Já existentes: ${jaExistentesNesta}`);
      }
      console.log('');
      
      totalMigrados += migradosNesta;
      totalJaExistentes += jaExistentesNesta;
    }
    
    await connection.commit();
    
    console.log('✅ Migração concluída com sucesso!\n');
    console.log('📊 RESUMO:');
    console.log(`   - Total de convidados migrados: ${totalMigrados}`);
    console.log(`   - Total de convidados já existentes: ${totalJaExistentes}`);
    console.log(`   - Total de promoters processados: ${promotersComListas.length}`);
    
  } catch (error) {
    await connection.rollback();
    console.error('❌ Erro durante migração:', error);
    console.error(error.stack);
    throw error;
  } finally {
    connection.release();
    await pool.end();
    process.exit(0);
  }
}

migrarConvidados();


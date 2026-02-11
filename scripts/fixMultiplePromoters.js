// Script para corrigir múltiplos promoters de uma vez
const pool = require('../config/database');
const bcrypt = require('bcryptjs');

// Lista de promoters fornecida pelo usuário
const promotersToFix = [
  {
    nome: 'Malvex',
    email: 'malvex@highlinebar.com.br',
    senha: 'Promoter@2025',
    codigo: 'malvex'
  },
  {
    nome: 'Marcelo Negão',
    email: 'marcelonegao@highlinebar.com.br',
    senha: 'Promoter@2025',
    codigo: 'negao'
  },
  {
    nome: 'Rodrigo Costa',
    email: 'rodrigocosta@highlinebar.com.br',
    senha: 'Promoter@2025',
    codigo: 'rodrigocosta'
  },
  {
    nome: 'Sidney',
    email: 'sidney@highlinebar.com.br',
    senha: 'Promoter@2025',
    codigo: 'sidney'
  },
  {
    nome: 'Pantaleão',
    email: 'pantaleao@highlinebar.com.br',
    senha: 'Promoter@2025',
    codigo: 'pantaleao'
  },
  {
    nome: 'Baxur',
    email: 'baxur@highlinebar.com.br',
    senha: 'Promoter@2025',
    codigo: 'baxur'
  },
  {
    nome: 'AriGucci',
    email: 'ariguggi@highline.com.br',
    senha: 'Promoter@2025',
    codigo: 'ariguggi'
  },
  {
    nome: 'Rodrigo Cogu',
    email: 'rodtigocogu@highlinebar.com.br',
    senha: 'Promoter@2025',
    codigo: null // URL não especificada corretamente
  }
];

async function fixPromoter(promoterData) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔍 Processando: ${promoterData.nome} (${promoterData.email})`);
    console.log(`${'='.repeat(80)}`);
    
    // 1. Buscar o promoter pelo email
    const promoterResult = await client.query(
      `SELECT 
        promoter_id, 
        nome, 
        apelido,
        email, 
        telefone, 
        whatsapp,
        codigo_identificador,
        status,
        ativo,
        tipo_categoria,
        establishment_id
      FROM promoters 
      WHERE LOWER(email) = LOWER($1)`,
      [promoterData.email]
    );
    
    if (promoterResult.rows.length === 0) {
      console.log(`❌ Promoter com email "${promoterData.email}" não encontrado no banco de dados.`);
      console.log(`   Verifique se o email está correto ou se o promoter precisa ser criado.`);
      await client.query('ROLLBACK');
      return { success: false, error: 'Promoter não encontrado' };
    }
    
    const promoter = promoterResult.rows[0];
    console.log(`✅ Promoter encontrado:`);
    console.log(`   ID: ${promoter.promoter_id}`);
    console.log(`   Nome: ${promoter.nome}`);
    console.log(`   Email: ${promoter.email}`);
    console.log(`   Código Atual: ${promoter.codigo_identificador || 'Não definido'}`);
    console.log(`   Status: ${promoter.status}`);
    console.log(`   Ativo: ${promoter.ativo}`);
    
    // 2. Atualizar código identificador se necessário
    let needsUpdate = false;
    const updates = [];
    
    if (promoterData.codigo && promoter.codigo_identificador !== promoterData.codigo) {
      console.log(`\n⚠️  Código identificador diferente. Atualizando de "${promoter.codigo_identificador}" para "${promoterData.codigo}"...`);
      updates.push(`codigo_identificador = '${promoterData.codigo}'`);
      needsUpdate = true;
    }
    
    if (!promoter.ativo) {
      console.log(`\n⚠️  Promoter está inativo. Ativando...`);
      updates.push('ativo = TRUE');
      needsUpdate = true;
    }
    
    if (promoter.status !== 'Ativo') {
      console.log(`\n⚠️  Status do promoter é "${promoter.status}". Alterando para "Ativo"...`);
      updates.push(`status = 'Ativo'`);
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      await client.query(
        `UPDATE promoters SET ${updates.join(', ')} WHERE promoter_id = $1`,
        [promoter.promoter_id]
      );
      console.log(`✅ Promoter atualizado!`);
    }
    
    // 3. Verificar/criar usuário
    console.log(`\n🔍 Verificando usuário na tabela users...`);
    const userResult = await client.query(
      'SELECT id, name, email, role, telefone FROM users WHERE LOWER(email) = LOWER($1)',
      [promoterData.email]
    );
    
    let userId;
    const hashedPassword = await bcrypt.hash(promoterData.senha, 10);
    
    if (userResult.rows.length === 0) {
      // Criar novo usuário
      console.log(`\n✨ Criando novo usuário...`);
      
      // Gerar um CPF temporário baseado no ID do promoter
      const tempCpf = `00000000${String(promoter.promoter_id).padStart(3, '0')}`;
      
      const newUserResult = await client.query(
        `INSERT INTO users (name, email, password, role, telefone, cpf)
         VALUES ($1, $2, $3, 'promoter', $4, $5)
         RETURNING id`,
        [promoter.nome, promoterData.email, hashedPassword, promoter.telefone || null, tempCpf]
      );
      
      userId = newUserResult.rows[0].id;
      console.log(`✅ Usuário criado com sucesso! ID: ${userId}`);
    } else {
      // Atualizar usuário existente
      userId = userResult.rows[0].id;
      console.log(`\n🔄 Usuário já existe com ID: ${userId}`);
      console.log(`   Nome atual: ${userResult.rows[0].name}`);
      console.log(`   Role atual: ${userResult.rows[0].role}`);
      
      // Verificar se precisa atualizar
      if (userResult.rows[0].role !== 'promoter') {
        console.log(`   ⚠️  Role atual é "${userResult.rows[0].role}". Alterando para "promoter"...`);
      }
      
      // Verificar se o usuário tem CPF
      const userCheck = await client.query('SELECT cpf FROM users WHERE id = $1', [userId]);
      const currentCpf = userCheck.rows[0]?.cpf;
      const tempCpf = currentCpf || `00000000${String(promoter.promoter_id).padStart(3, '0')}`;
      
      await client.query(
        `UPDATE users SET 
          name = $1, 
          role = 'promoter', 
          password = $2, 
          telefone = $3,
          cpf = $4
        WHERE id = $5`,
        [promoter.nome, hashedPassword, promoter.telefone || null, tempCpf, userId]
      );
      
      console.log(`✅ Usuário atualizado com sucesso!`);
    }
    
    // 4. Verificar se a coluna user_id existe e vincular
    let hasUserIdColumn = false;
    try {
      const columnCheck = await client.query(
        `SELECT column_name 
         FROM information_schema.columns 
         WHERE table_name = 'promoters' 
         AND column_name = 'user_id'
         LIMIT 1`
      );
      hasUserIdColumn = columnCheck.rows.length > 0;
    } catch (e) {
      console.log('⚠️  Não foi possível verificar se a coluna user_id existe');
    }
    
    if (hasUserIdColumn) {
      // Buscar o promoter atualizado para pegar o user_id atual
      const updatedPromoter = await client.query(
        'SELECT user_id FROM promoters WHERE promoter_id = $1',
        [promoter.promoter_id]
      );
      const currentUserId = updatedPromoter.rows[0]?.user_id;
      
      if (currentUserId !== userId) {
        console.log(`\n🔗 Vinculando user_id ${userId} ao promoter ${promoter.promoter_id}...`);
        
        await client.query(
          'UPDATE promoters SET user_id = $1 WHERE promoter_id = $2',
          [userId, promoter.promoter_id]
        );
        
        console.log(`✅ Vinculação realizada com sucesso!`);
      } else {
        console.log(`\n✅ Promoter já está vinculado ao usuário correto.`);
      }
    }
    
    await client.query('COMMIT');
    
    // Buscar dados atualizados
    const finalPromoter = await client.query(
      'SELECT codigo_identificador, ativo, status FROM promoters WHERE promoter_id = $1',
      [promoter.promoter_id]
    );
    
    console.log(`\n🎉 Processo concluído com sucesso!`);
    console.log(`\n📋 Resumo:`);
    console.log(`   Promoter: ${promoter.nome}`);
    console.log(`   Email: ${promoterData.email}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Código Identificador: ${finalPromoter.rows[0].codigo_identificador || 'Não definido'}`);
    console.log(`   Status: ${finalPromoter.rows[0].status}`);
    console.log(`   Ativo: ${finalPromoter.rows[0].ativo ? 'Sim' : 'Não'}`);
    console.log(`   Senha: ${promoterData.senha}`);
    
    if (finalPromoter.rows[0].codigo_identificador) {
      console.log(`\n💡 URL de acesso:`);
      console.log(`   https://www.agilizaiapp.com.br/promoter/${finalPromoter.rows[0].codigo_identificador}/dashboard`);
    }
    
    return { 
      success: true, 
      promoterId: promoter.promoter_id,
      userId: userId,
      codigo: finalPromoter.rows[0].codigo_identificador
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`❌ Erro ao corrigir promoter ${promoterData.nome}:`, error);
    return { success: false, error: error.message };
  } finally {
    client.release();
  }
}

async function fixAllPromoters() {
  console.log('🚀 Iniciando correção de múltiplos promoters...\n');
  
  const results = [];
  
  for (const promoterData of promotersToFix) {
    const result = await fixPromoter(promoterData);
    results.push({
      nome: promoterData.nome,
      email: promoterData.email,
      ...result
    });
    
    // Pequeno delay entre processamentos
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log('📊 RESUMO FINAL');
  console.log(`${'='.repeat(80)}\n`);
  
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  
  console.log(`✅ Sucessos: ${successCount}`);
  console.log(`❌ Falhas: ${failCount}\n`);
  
  console.log('Detalhes por promoter:');
  results.forEach((result, index) => {
    console.log(`\n${index + 1}. ${result.nome} (${result.email})`);
    if (result.success) {
      console.log(`   ✅ Corrigido com sucesso`);
      console.log(`   📍 Código: ${result.codigo || 'Não definido'}`);
      if (result.codigo) {
        console.log(`   🔗 URL: https://www.agilizaiapp.com.br/promoter/${result.codigo}/dashboard`);
      }
    } else {
      console.log(`   ❌ Erro: ${result.error || 'Erro desconhecido'}`);
    }
  });
  
  console.log(`\n${'='.repeat(80)}`);
  console.log('✅ Processo finalizado!');
  console.log(`${'='.repeat(80)}\n`);
}

// Executar o script
fixAllPromoters()
  .then(() => {
    console.log('✅ Script executado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro ao executar script:', error);
    process.exit(1);
  });

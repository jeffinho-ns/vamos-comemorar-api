// Script para criar usuário para um promoter específico
const pool = require('../config/database');
const bcrypt = require('bcryptjs');

async function createUserForPromoter(promoterName) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log(`🔍 Buscando promoter: ${promoterName}...`);
    
    // Buscar o promoter pelo nome
    // Primeiro, verificar se a coluna user_id existe
    let hasUserIdColumn = false;
    try {
      const columnCheck = await client.query(
        `SELECT column_name 
         FROM information_schema.columns 
         WHERE table_schema = 'meu_backup_db' 
         AND table_name = 'promoters' 
         AND column_name = 'user_id'`
      );
      hasUserIdColumn = columnCheck.rows.length > 0;
    } catch (e) {
      console.log('⚠️  Não foi possível verificar se a coluna user_id existe');
    }
    
    const selectFields = hasUserIdColumn 
      ? 'promoter_id, nome, email, telefone, user_id'
      : 'promoter_id, nome, email, telefone';
    
    const promoterResult = await client.query(
      `SELECT ${selectFields} 
       FROM promoters 
       WHERE LOWER(nome) LIKE LOWER($1)`,
      [`%${promoterName}%`]
    );
    
    if (promoterResult.rows.length === 0) {
      console.log(`❌ Promoter "${promoterName}" não encontrado no banco de dados.`);
      return;
    }
    
    if (promoterResult.rows.length > 1) {
      console.log(`⚠️  Múltiplos promoters encontrados:`);
      promoterResult.rows.forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.nome} (ID: ${p.promoter_id}, Email: ${p.email})`);
      });
      console.log(`\n💡 Use um nome mais específico ou o ID do promoter.`);
      return;
    }
    
    const promoter = promoterResult.rows[0];
    console.log(`✅ Promoter encontrado:`);
    console.log(`   ID: ${promoter.promoter_id}`);
    console.log(`   Nome: ${promoter.nome}`);
    console.log(`   Email: ${promoter.email}`);
    console.log(`   Telefone: ${promoter.telefone || 'Não informado'}`);
    if (hasUserIdColumn) {
      console.log(`   User ID atual: ${promoter.user_id || 'Não vinculado'}`);
    }
    
    if (!promoter.email) {
      console.log(`❌ Promoter não possui email cadastrado. Não é possível criar usuário.`);
      return;
    }
    
    // Verificar se já existe um usuário com este email
    const existingUserResult = await client.query(
      'SELECT id, name, email, role FROM users WHERE email = $1',
      [promoter.email]
    );
    
    let userId;
    const defaultPassword = 'Promoter@2025';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    
    if (existingUserResult.rows.length > 0) {
      // Se o usuário já existe, atualizar
      userId = existingUserResult.rows[0].id;
      console.log(`\n🔄 Usuário já existe com ID: ${userId}`);
      console.log(`   Atualizando para role 'promoter' e redefinindo senha...`);
      
      // Verificar se o usuário tem CPF, se não tiver, gerar um temporário
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
    } else {
      // Criar novo usuário
      console.log(`\n✨ Criando novo usuário...`);
      
      // Gerar um CPF temporário baseado no email se não houver CPF
      // Usar um formato válido mas único: 00000000000 + últimos dígitos do ID do promoter
      const tempCpf = `00000000${String(promoter.promoter_id).padStart(3, '0')}`;
      
      const userResult = await client.query(
        `INSERT INTO users (name, email, password, role, telefone, cpf)
         VALUES ($1, $2, $3, 'promoter', $4, $5)
         RETURNING id`,
        [promoter.nome, promoter.email, hashedPassword, promoter.telefone || null, tempCpf]
      );
      
      userId = userResult.rows[0].id;
      console.log(`✅ Usuário criado com sucesso! ID: ${userId}`);
    }
    
    // Vincular user_id ao promoter se a coluna existir
    if (hasUserIdColumn) {
      const currentUserId = promoter.user_id;
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
    } else {
      console.log(`\n⚠️  Coluna user_id não existe na tabela promoters. Pulando vinculação.`);
      console.log(`   O usuário foi criado, mas não foi vinculado ao promoter.`);
    }
    
    await client.query('COMMIT');
    
    console.log(`\n🎉 Processo concluído com sucesso!`);
    console.log(`\n📋 Resumo:`);
    console.log(`   Promoter: ${promoter.nome}`);
    console.log(`   Email: ${promoter.email}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Senha padrão: ${defaultPassword}`);
    console.log(`\n💡 O promoter pode fazer login com:`);
    console.log(`   Email: ${promoter.email}`);
    console.log(`   Senha: ${defaultPassword}`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erro ao criar usuário para promoter:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Executar o script
const promoterName = process.argv[2] || 'Fran Poschi';

if (!promoterName) {
  console.log('❌ Por favor, forneça o nome do promoter.');
  console.log('   Uso: node scripts/createUserForPromoter.js "Nome do Promoter"');
  process.exit(1);
}

createUserForPromoter(promoterName)
  .then(() => {
    console.log('\n✅ Script executado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro ao executar script:', error);
    process.exit(1);
  });


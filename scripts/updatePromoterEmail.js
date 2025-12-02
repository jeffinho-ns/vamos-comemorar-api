// Script para atualizar email do promoter
const pool = require('../config/database');

async function updatePromoterEmail(oldEmail, newEmail) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log(`🔍 Atualizando email do promoter...\n`);
    console.log(`   Email antigo: ${oldEmail}`);
    console.log(`   Email novo: ${newEmail}\n`);
    
    // 1. Verificar se o promoter existe
    const promoterResult = await client.query(
      'SELECT promoter_id, nome, email FROM promoters WHERE email = $1',
      [oldEmail]
    );
    
    if (promoterResult.rows.length === 0) {
      console.log(`❌ Promoter com email "${oldEmail}" não encontrado.`);
      return;
    }
    
    const promoter = promoterResult.rows[0];
    console.log(`✅ Promoter encontrado:`);
    console.log(`   ID: ${promoter.promoter_id}`);
    console.log(`   Nome: ${promoter.nome}`);
    console.log(`   Email atual: ${promoter.email}\n`);
    
    // 2. Verificar se o novo email já está em uso
    const checkNewEmail = await client.query(
      'SELECT promoter_id, nome FROM promoters WHERE email = $1',
      [newEmail]
    );
    
    if (checkNewEmail.rows.length > 0) {
      console.log(`❌ O email "${newEmail}" já está em uso por outro promoter:`);
      console.log(`   ID: ${checkNewEmail.rows[0].promoter_id}`);
      console.log(`   Nome: ${checkNewEmail.rows[0].nome}`);
      return;
    }
    
    // 3. Verificar se existe usuário com o email antigo
    const userResult = await client.query(
      'SELECT id, name, email FROM users WHERE email = $1',
      [oldEmail]
    );
    
    let userId = null;
    if (userResult.rows.length > 0) {
      userId = userResult.rows[0].id;
      console.log(`✅ Usuário encontrado:`);
      console.log(`   User ID: ${userId}`);
      console.log(`   Nome: ${userResult.rows[0].name}\n`);
    } else {
      console.log(`⚠️  Nenhum usuário encontrado com o email antigo.\n`);
    }
    
    // 4. Atualizar email no promoter
    console.log(`🔄 Atualizando email no promoter...`);
    await client.query(
      'UPDATE promoters SET email = $1 WHERE promoter_id = $2',
      [newEmail, promoter.promoter_id]
    );
    console.log(`✅ Email do promoter atualizado!\n`);
    
    // 5. Atualizar email no usuário se existir
    if (userId) {
      console.log(`🔄 Atualizando email no usuário...`);
      await client.query(
        'UPDATE users SET email = $1 WHERE id = $2',
        [newEmail, userId]
      );
      console.log(`✅ Email do usuário atualizado!\n`);
    }
    
    await client.query('COMMIT');
    
    console.log(`🎉 Email atualizado com sucesso!`);
    console.log(`\n📋 Resumo:`);
    console.log(`   Promoter: ${promoter.nome}`);
    console.log(`   Email antigo: ${oldEmail}`);
    console.log(`   Email novo: ${newEmail}`);
    if (userId) {
      console.log(`   User ID: ${userId}`);
    }
    console.log(`\n💡 O promoter pode fazer login com:`);
    console.log(`   Email: ${newEmail}`);
    console.log(`   Senha: Promoter@2025`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erro ao atualizar email:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Executar o script
const oldEmail = process.argv[2];
const newEmail = process.argv[3];

if (!oldEmail || !newEmail) {
  console.log('❌ Por favor, forneça o email antigo e o novo.');
  console.log('   Uso: node scripts/updatePromoterEmail.js "email-antigo@exemplo.com" "email-novo@exemplo.com"');
  process.exit(1);
}

updatePromoterEmail(oldEmail, newEmail)
  .then(() => {
    console.log('\n✅ Script executado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro ao executar script:', error);
    process.exit(1);
  });



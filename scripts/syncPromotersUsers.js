/**
 * Script de manutenção para garantir que todos os promoters possuam
 * um usuário correspondente na tabela `users` com role "promoter".
 *
 * Como executar:
 *   1. Copie o arquivo `.env.example` para `.env` (se ainda não existir)
 *   2. Ajuste DB_HOST, DB_USER, DB_PASSWORD, DB_NAME e PROMOTER_DEFAULT_PASSWORD se necessário
 *   3. Rode: `node scripts/syncPromotersUsers.js`
 *
 * O script:
 *   - Busca todos os promoters (ativos ou não, conforme configurado)
 *   - Cria usuários faltantes
 *   - Atualiza dados básicos de usuários existentes (nome/email/telefone)
 *   - Opcionalmente reseta a senha para o valor padrão
 *   - Atualiza o campo `promoters.user_id`
 *
 * IMPORTANTE:
 *   - Executar preferencialmente em ambiente de manutenção (sem usuários logando)
 *   - Após a execução, os promoters podem acessar /login com a senha padrão, salvo se resetPassword=false
 */

require('dotenv').config();

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const DEFAULT_PASSWORD = process.env.PROMOTER_DEFAULT_PASSWORD || 'Promoter@2024';

const config = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
};

const options = {
  apenasAtivos: true,      // true => só promoters com ativo = 1; false => todos
  resetPassword: true,     // true => reseta a senha para DEFAULT_PASSWORD
  logDetalhado: true,
};

async function main() {
  console.log('🚀 Iniciando sincronização de usuários de promoters...');
  console.log('Configuração do banco:', {
    host: config.host,
    database: config.database,
    apenasAtivos: options.apenasAtivos,
    resetPassword: options.resetPassword,
  });

  const pool = await mysql.createPool(config);

  try {
    const hashedPassword = options.resetPassword
      ? bcrypt.hashSync(DEFAULT_PASSWORD, 10)
      : null;

    const statusFilter = options.apenasAtivos ? 'AND p.ativo = TRUE' : '';

    const [promoters] = await pool.query(
      `SELECT 
         p.promoter_id,
         p.nome,
         p.email,
         p.telefone,
         p.whatsapp,
         p.user_id
       FROM promoters p
       WHERE 1=1 ${statusFilter}`
    );

    console.log(`Encontrados ${promoters.length} promoters para processar.`);

    const resumo = {
      totalPromoters: promoters.length,
      processados: 0,
      vinculadosNovos: 0,
      vinculadosAtualizados: 0,
      ignoradosSemEmail: [],
      erros: [],
      senhaPadraoAplicada: options.resetPassword ? DEFAULT_PASSWORD : null,
    };

    for (const promoter of promoters) {
      if (!promoter.email) {
        resumo.ignoradosSemEmail.push({
          promoter_id: promoter.promoter_id,
          nome: promoter.nome,
          motivo: 'Promoter sem email cadastrado',
        });
        if (options.logDetalhado) {
          console.warn(`⚠️  Promoter ${promoter.promoter_id} (${promoter.nome}) ignorado: sem email.`);
        }
        continue;
      }

      const telefone = promoter.telefone || promoter.whatsapp || null;

      try {
        let userId = promoter.user_id;

        if (!userId) {
          const [existingUserByEmail] = await pool.execute(
            'SELECT id FROM users WHERE email = ?',
            [promoter.email]
          );

          if (existingUserByEmail.length > 0) {
            userId = existingUserByEmail[0].id;
          }
        }

        if (userId) {
          const updates = [
            'name = ?',
            'email = ?',
            'role = ?',
            'telefone = ?',
          ];
          const params = [
            promoter.nome,
            promoter.email,
            'promoter',
            telefone,
          ];

          if (options.resetPassword && hashedPassword) {
            updates.push('password = ?');
            params.push(hashedPassword);
          }

          params.push(userId);

          await pool.execute(
            `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
            params
          );

          if (options.logDetalhado) {
            console.log(`🔁 Atualizado usuário ${userId} para promoter ${promoter.promoter_id}`);
          }

          resumo.vinculadosAtualizados += 1;
        } else {
          const [insertResult] = await pool.execute(
            `INSERT INTO users (name, email, role, password, telefone, created_at)
             VALUES (?, ?, 'promoter', ?, ?, NOW())`,
            [
              promoter.nome,
              promoter.email,
              hashedPassword || bcrypt.hashSync(DEFAULT_PASSWORD, 10),
              telefone,
            ]
          );

          userId = insertResult.insertId;
          resumo.vinculadosNovos += 1;

          if (options.logDetalhado) {
            console.log(`✨ Criado usuário ${userId} para promoter ${promoter.promoter_id}`);
          }
        }

        if (promoter.user_id !== userId) {
          await pool.execute(
            'UPDATE promoters SET user_id = ? WHERE promoter_id = ?',
            [userId, promoter.promoter_id]
          );
          if (options.logDetalhado) {
            console.log(`🔗 Vinculado promoter ${promoter.promoter_id} ao usuário ${userId}`);
          }
        }

        resumo.processados += 1;
      } catch (promoterError) {
        console.error('❌ Erro ao processar promoter:', promoter.promoter_id, promoterError);
        resumo.erros.push({
          promoter_id: promoter.promoter_id,
          nome: promoter.nome,
          erro: promoterError.message,
        });
      }
    }

    console.log('\n📊 Resumo da sincronização');
    console.table({
      'Promoters processados': resumo.processados,
      'Usuários criados': resumo.vinculadosNovos,
      'Usuários atualizados': resumo.vinculadosAtualizados,
      'Sem email (ignorados)': resumo.ignoradosSemEmail.length,
      'Com erro': resumo.erros.length,
    });

    if (options.resetPassword) {
      console.log(`🔐 Senha padrão aplicada: ${DEFAULT_PASSWORD}`);
    } else {
      console.log('⚠️ Senha padrão NÃO foi alterada (resetPassword=false).');
    }

    if (resumo.ignoradosSemEmail.length > 0) {
      console.log('\n⚠️ Promoters sem email:');
      console.table(resumo.ignoradosSemEmail);
    }

    if (resumo.erros.length > 0) {
      console.log('\n❗ Ocorreram erros em alguns promoters:');
      console.table(resumo.erros);
    }

    console.log('\n✅ Sincronização concluída.');
  } catch (error) {
    console.error('❌ Erro fatal na sincronização:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();


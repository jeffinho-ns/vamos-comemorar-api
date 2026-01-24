/**
 * Script para adicionar os usuários caixasjm, gerente.sjm e subgerente.sjm do Seu Justino.
 *
 * - caixasjm@seujustino.com.br: role "recepção", mesmas funções que recepcao@seujustino.com.br, apenas estabelecimento Seu Justino.
 * - gerente.sjm@seujustino.com.br: role "gerente", acesso a todos os itens do menu/funções, apenas estabelecimento Seu Justino.
 * - subgerente.sjm@seujustino.com.br: role "gerente", mesmas funções do gerente.sjm, apenas estabelecimento Seu Justino.
 *
 * Senha para todos: @123Mudar
 * Estabelecimento: Seu Justino (places.id = 1)
 *
 * Uso: node scripts/add-seujustino-users.js
 */

const pool = require('../config/database');
const bcrypt = require('bcryptjs');

const SEU_JUSTINO_ESTABLISHMENT_ID = 1;
const DEFAULT_PASSWORD = '@123Mudar';

const USERS = [
  {
    email: 'caixasjm@seujustino.com.br',
    name: 'Caixa SJM Seu Justino',
    role: 'recepção',
    cpf: '00000000101',
    // Permissões estilo recepção: visualizar, baixar, gerenciar reservas/check-ins (sem editar OS/detalhes operacionais)
    permissions: {
      can_edit_os: false,
      can_edit_operational_detail: false,
      can_view_os: true,
      can_download_os: true,
      can_view_operational_detail: true,
      can_create_os: false,
      can_create_operational_detail: false,
      can_manage_reservations: true,
      can_manage_checkins: true,
      can_view_reports: true,
    },
  },
  {
    email: 'gerente.sjm@seujustino.com.br',
    name: 'Gerente SJM Seu Justino',
    role: 'gerente',
    cpf: '00000000102',
    // Acesso total, apenas restrito ao estabelecimento Seu Justino
    permissions: {
      can_edit_os: true,
      can_edit_operational_detail: true,
      can_view_os: true,
      can_download_os: true,
      can_view_operational_detail: true,
      can_create_os: true,
      can_create_operational_detail: true,
      can_manage_reservations: true,
      can_manage_checkins: true,
      can_view_reports: true,
    },
  },
  {
    email: 'subgerente.sjm@seujustino.com.br',
    name: 'Subgerente SJM Seu Justino',
    role: 'gerente',
    cpf: '00000000103',
    // Mesmas funções do gerente.sjm
    permissions: {
      can_edit_os: true,
      can_edit_operational_detail: true,
      can_view_os: true,
      can_download_os: true,
      can_view_operational_detail: true,
      can_create_os: true,
      can_create_operational_detail: true,
      can_manage_reservations: true,
      can_manage_checkins: true,
      can_view_reports: true,
    },
  },
];

async function run() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    for (const u of USERS) {
      let existing = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [u.email]
      );

      let userId;
      if (existing.rows.length > 0) {
        userId = existing.rows[0].id;
        await client.query(
          `UPDATE users SET name = $1, password = $2, role = $3 WHERE id = $4`,
          [u.name, hashedPassword, u.role, userId]
        );
        console.log(`✅ Usuário atualizado: ${u.email} (id ${userId}), role ${u.role}`);
      } else {
        const insertUser = await client.query(
          `INSERT INTO users (name, email, password, role, cpf)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [u.name, u.email, hashedPassword, u.role, u.cpf]
        );
        userId = insertUser.rows[0].id;
        console.log(`✅ Usuário criado: ${u.email} (id ${userId}), role ${u.role}`);
      }

      const p = u.permissions;
      await client.query(
        `INSERT INTO user_establishment_permissions (
          user_id, user_email, establishment_id,
          can_edit_os, can_edit_operational_detail,
          can_view_os, can_download_os, can_view_operational_detail,
          can_create_os, can_create_operational_detail,
          can_manage_reservations, can_manage_checkins, can_view_reports,
          is_active, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, TRUE, NULL)
        ON CONFLICT (user_id, establishment_id) DO UPDATE SET
          can_edit_os = EXCLUDED.can_edit_os,
          can_edit_operational_detail = EXCLUDED.can_edit_operational_detail,
          can_view_os = EXCLUDED.can_view_os,
          can_download_os = EXCLUDED.can_download_os,
          can_view_operational_detail = EXCLUDED.can_view_operational_detail,
          can_create_os = EXCLUDED.can_create_os,
          can_create_operational_detail = EXCLUDED.can_create_operational_detail,
          can_manage_reservations = EXCLUDED.can_manage_reservations,
          can_manage_checkins = EXCLUDED.can_manage_checkins,
          can_view_reports = EXCLUDED.can_view_reports,
          is_active = TRUE,
          updated_at = CURRENT_TIMESTAMP`,
        [
          userId,
          u.email,
          SEU_JUSTINO_ESTABLISHMENT_ID,
          p.can_edit_os,
          p.can_edit_operational_detail,
          p.can_view_os,
          p.can_download_os,
          p.can_view_operational_detail,
          p.can_create_os,
          p.can_create_operational_detail,
          p.can_manage_reservations,
          p.can_manage_checkins,
          p.can_view_reports,
        ]
      );
      console.log(`   Permissões configuradas para estabelecimento Seu Justino (id ${SEU_JUSTINO_ESTABLISHMENT_ID}).`);
    }

    await client.query('COMMIT');
    console.log('\n🎉 Concluído. Os usuários podem fazer login com senha: ' + DEFAULT_PASSWORD);
    console.log('   caixasjm@seujustino.com.br (recepção)');
    console.log('   gerente.sjm@seujustino.com.br (gerente)');
    console.log('   subgerente.sjm@seujustino.com.br (gerente)');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Erro:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

run()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

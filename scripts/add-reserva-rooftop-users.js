/**
 * Script para adicionar usuários do estabelecimento Reserva Rooftop.
 *
 * PRÉ-REQUISITO: Execute antes a migration que adiciona a coluna can_create_edit_reservations:
 *   psql ... -f migrations/add_can_create_edit_reservations_postgresql.sql
 * (ou rode a migration via seu processo habitual)
 *
 * Grupo 1 - Apenas visualizar/validar (sem adicionar/editar reservas ou lista de espera):
 *   Recepcao@reservarooftop.com.br
 *   gerente.maitre@reservarooftop.com.br
 *   diego.gomes@reservarooftop.com.br
 * Acesso: Check-in, Sistema de Reservas (só check-in/check-out/alocar mesa), Detalhes Operacionais (visualizar), Scanner QR Code.
 *
 * Grupo 2 - Acesso completo (podem adicionar, editar e excluir reservas e lista de espera):
 *   vbs14@hotmail.com
 *   reservas@reservarooftop.com.br
 *   coordenadora.reservas@ideiaum.com.br
 *   analista.mkt02@ideiaum.com.br
 *
 * Senha padrão para novos usuários: @123Mudar
 * Estabelecimento: Reserva Rooftop (places.id = 9)
 *
 * Uso: node scripts/add-reserva-rooftop-users.js
 */

const pool = require('../config/database');
const bcrypt = require('bcryptjs');

const RESERVA_ROOFTOP_ESTABLISHMENT_ID = 9;
const DEFAULT_PASSWORD = '@123Mudar';

// Grupo 1: só validar check-in, check-out, alocar mesa. Não podem criar/editar reservas nem lista de espera.
const USERS_VIEW_ONLY = [
  { email: 'Recepcao@reservarooftop.com.br', name: 'Recepção Reserva Rooftop' },
  { email: 'gerente.maitre@reservarooftop.com.br', name: 'Gerente Maitre Reserva Rooftop' },
  { email: 'diego.gomes@reservarooftop.com.br', name: 'Diego Gomes Reserva Rooftop' },
];

// Grupo 2: podem adicionar, editar e excluir reservas e lista de espera.
const USERS_FULL = [
  { email: 'vbs14@hotmail.com', name: 'VBS Reserva Rooftop' },
  { email: 'reservas@reservarooftop.com.br', name: 'Reservas Reserva Rooftop' },
  { email: 'coordenadora.reservas@ideiaum.com.br', name: 'Coordenadora Reservas Ideiaum' },
  { email: 'analista.mkt02@ideiaum.com.br', name: 'Analista MKT02 Ideiaum' },
];

const PERMISSIONS_VIEW_ONLY = {
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
  can_create_edit_reservations: false, // não podem criar/editar reservas nem lista de espera
};

const PERMISSIONS_FULL = {
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
  can_create_edit_reservations: true,
};

async function run() {
  const client = await pool.connect();

  try {
    // Verificar se a coluna can_create_edit_reservations existe
    const colCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'user_establishment_permissions' AND column_name = 'can_create_edit_reservations'
    `);
    if (colCheck.rows.length === 0) {
      console.error('❌ Coluna can_create_edit_reservations não encontrada. Execute antes:');
      console.error('   psql -f migrations/add_can_create_edit_reservations_postgresql.sql');
      process.exit(1);
    }

    await client.query('BEGIN');

    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    const allUsers = [
      ...USERS_VIEW_ONLY.map((u) => ({ ...u, permissions: PERMISSIONS_VIEW_ONLY })),
      ...USERS_FULL.map((u) => ({ ...u, permissions: PERMISSIONS_FULL })),
    ];

    let userIndex = 0;
    for (const u of allUsers) {
      userIndex += 1;
      const emailNormalized = u.email.trim().toLowerCase();
      let existing = await client.query(
        'SELECT id FROM users WHERE LOWER(email) = $1',
        [emailNormalized]
      );

      let userId;
      if (existing.rows.length > 0) {
        userId = existing.rows[0].id;
        await client.query(
          `UPDATE users SET name = $1, password = $2, role = $3 WHERE id = $4`,
          [u.name, hashedPassword, 'recepção', userId]
        );
        console.log(`✅ Usuário atualizado: ${u.email} (id ${userId}), role recepção`);
      } else {
        const placeholderCpf = `000000009${String(userIndex).padStart(2, '0')}`;
        const insertUser = await client.query(
          `INSERT INTO users (name, email, password, role, cpf)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [u.name, emailNormalized, hashedPassword, 'recepção', placeholderCpf]
        );
        userId = insertUser.rows[0].id;
        console.log(`✅ Usuário criado: ${u.email} (id ${userId}), role recepção`);
      }

      const p = u.permissions;
      await client.query(
        `INSERT INTO user_establishment_permissions (
          user_id, user_email, establishment_id,
          can_edit_os, can_edit_operational_detail,
          can_view_os, can_download_os, can_view_operational_detail,
          can_create_os, can_create_operational_detail,
          can_manage_reservations, can_manage_checkins, can_view_reports,
          can_create_edit_reservations,
          is_active, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, TRUE, NULL)
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
          can_create_edit_reservations = EXCLUDED.can_create_edit_reservations,
          is_active = TRUE,
          updated_at = CURRENT_TIMESTAMP`,
        [
          userId,
          emailNormalized,
          RESERVA_ROOFTOP_ESTABLISHMENT_ID,
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
          p.can_create_edit_reservations,
        ]
      );
      const tipo = p.can_create_edit_reservations ? 'acesso completo' : 'apenas validar (sem criar/editar reservas ou lista de espera)';
      console.log(`   Permissões: ${tipo} — estabelecimento Reserva Rooftop (id ${RESERVA_ROOFTOP_ESTABLISHMENT_ID}).`);
    }

    await client.query('COMMIT');
    console.log('\n🎉 Concluído. Novos usuários podem fazer login com senha: ' + DEFAULT_PASSWORD);
    console.log('   Grupo 1 (só validar): Recepcao@reservarooftop.com.br, gerente.maitre@reservarooftop.com.br, diego.gomes@reservarooftop.com.br');
    console.log('   Grupo 2 (completo): vbs14@hotmail.com, reservas@reservarooftop.com.br, coordenadora.reservas@ideiaum.com.br, analista.mkt02@ideiaum.com.br');
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

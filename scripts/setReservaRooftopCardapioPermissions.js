/**
 * Libera Cardápio (UEP) para a equipe Reserva Rooftop / Pinheiros.
 *
 * Contexto: com SAAS_MODE=on, o role SaaS `recepcao` NÃO inclui cardapio:read.
 * Usuários criados como role=recepção (ex.: gerente.maitre@…) passam a receber
 * 403 em GET /api/cardapio/* se can_view_cardapio estiver false/ausente no UEP.
 *
 * Uso:
 *   DATABASE_URL=... node scripts/setReservaRooftopCardapioPermissions.js
 *   DATABASE_URL=... node scripts/setReservaRooftopCardapioPermissions.js --apply
 *
 * Sem --apply: só imprime o diagnóstico (dry-run).
 */

require('dotenv').config();
const { Pool } = require('pg');
const { requireDatabaseUrl } = require('../config/resolveDatabaseUrl');

const TARGET_EMAILS = [
  'gerente.maitre@reservarooftop.com.br',
  'recepcao@reservarooftop.com.br',
  'diego.gomes@reservarooftop.com.br',
  'reservas@reservarooftop.com.br',
  'vbs14@hotmail.com',
];

const PLACE_IDS = [9]; // Reserva Rooftop (places.id). Pinheiros=21 só se já existir UEP.

async function main() {
  const apply = process.argv.includes('--apply');
  const connectionString = requireDatabaseUrl();
  const pool = new Pool({
    connectionString,
    ssl: /render\.com|amazonaws|supabase/i.test(connectionString)
      ? { rejectUnauthorized: false }
      : undefined,
  });

  const client = await pool.connect();
  try {
    console.log(apply ? '=== APPLY ===' : '=== DRY-RUN (passe --apply para gravar) ===');

    const users = await client.query(
      `SELECT id, email, role::text AS role
         FROM users
        WHERE LOWER(TRIM(email)) = ANY($1::text[])
        ORDER BY email`,
      [TARGET_EMAILS.map((e) => e.toLowerCase())],
    );

    if (!users.rows.length) {
      console.error('Nenhum usuário alvo encontrado.');
      process.exitCode = 1;
      return;
    }

    for (const u of users.rows) {
      const perms = await client.query(
        `SELECT id, establishment_id, is_active,
                can_view_cardapio, can_create_cardapio, can_edit_cardapio, can_delete_cardapio
           FROM user_establishment_permissions
          WHERE user_id = $1
          ORDER BY establishment_id`,
        [u.id],
      );
      console.log('\n—', u.email, `id=${u.id} role=${u.role}`);
      if (!perms.rows.length) {
        console.log('  (sem UEP)');
      } else {
        for (const p of perms.rows) {
          console.log(
            `  UEP#${p.id} place=${p.establishment_id} active=${p.is_active}` +
              ` view=${p.can_view_cardapio} create=${p.can_create_cardapio}` +
              ` edit=${p.can_edit_cardapio} delete=${p.can_delete_cardapio}`,
          );
        }
      }

      const memberships = await client.query(
        `SELECT m.id, m.organization_id, m.establishment_id, m.is_active, r.key AS role_key
           FROM meu_backup_db.memberships m
           LEFT JOIN meu_backup_db.roles r ON r.id = m.role_id
          WHERE m.user_id = $1
          ORDER BY m.id`,
        [u.id],
      ).catch(() => ({ rows: [] }));
      for (const m of memberships.rows) {
        console.log(
          `  membership#${m.id} org=${m.organization_id} est=${m.establishment_id}` +
            ` role=${m.role_key} active=${m.is_active}`,
        );
      }

      if (!apply) continue;

      const placeIdsToTouch = new Set(PLACE_IDS);
      for (const p of perms.rows) {
        const id = Number(p.establishment_id);
        if (Number.isFinite(id) && id > 0) placeIdsToTouch.add(id);
      }

      for (const placeId of placeIdsToTouch) {
        await client.query(
          `
          INSERT INTO user_establishment_permissions (
            user_id, user_email, establishment_id,
            can_edit_os, can_edit_operational_detail,
            can_view_os, can_download_os, can_view_operational_detail,
            can_create_os, can_create_operational_detail,
            can_manage_reservations, can_manage_checkins, can_view_reports,
            can_create_edit_reservations,
            can_view_cardapio, can_create_cardapio, can_edit_cardapio, can_delete_cardapio,
            is_active
          )
          VALUES (
            $1, $2, $3,
            FALSE, FALSE,
            TRUE, TRUE, TRUE,
            FALSE, FALSE,
            TRUE, TRUE, TRUE,
            FALSE,
            TRUE, TRUE, TRUE, TRUE,
            TRUE
          )
          ON CONFLICT (user_id, establishment_id)
          DO UPDATE SET
            user_email = EXCLUDED.user_email,
            can_view_cardapio = TRUE,
            can_create_cardapio = TRUE,
            can_edit_cardapio = TRUE,
            can_delete_cardapio = TRUE,
            is_active = TRUE,
            updated_at = CURRENT_TIMESTAMP
          `,
          [u.id, String(u.email).toLowerCase(), placeId],
        );
        console.log(`  ✅ cardápio liberado em place ${placeId}`);
      }
    }

    if (!apply) {
      console.log('\nNada gravado. Rode de novo com --apply para aplicar.');
    } else {
      console.log('\nConcluído. Peça aos usuários para sair e entrar de novo (novo JWT/entitlements).');
    }
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error('❌', err.message || err);
  process.exitCode = 1;
});

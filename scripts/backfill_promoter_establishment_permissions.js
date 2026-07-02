#!/usr/bin/env node
/**
 * Promoters "analista@*" tinham escopo só em promoter-bars.ts (front).
 * O enforce SaaS (SAAS_MODE=on) usa user_establishment_permissions / memberships.
 *
 * Uso (staging/prod com cuidado):
 *   node scripts/backfill_promoter_establishment_permissions.js
 *   node scripts/backfill_promoter_establishment_permissions.js --dry-run
 */
require('dotenv').config();
const pool = require('../config/database');

/** barId (cardápio) → legacy_place_id operacional (places.id) */
const PROMOTER_BAR_TO_PLACE = [
  { email: 'analista@seujustino.com', placeId: 1 },
  { email: 'analista@ohfregues.com', placeId: 4 },
  { email: 'analista@highline.com', placeId: 7 },
  { email: 'analista@pracinha.com', placeId: 8 },
  { email: 'analista@reserva.com', placeId: 9 },
];

const dryRun = process.argv.includes('--dry-run');

(async () => {
  try {
    for (const row of PROMOTER_BAR_TO_PLACE) {
      const u = await pool.query(`SELECT id, email FROM users WHERE lower(email) = lower($1)`, [
        row.email,
      ]);
      if (!u.rows[0]) {
        console.log('SKIP (usuário não existe):', row.email);
        continue;
      }
      const { id: userId, email } = u.rows[0];
      const exists = await pool.query(
        `SELECT id FROM user_establishment_permissions
          WHERE user_id = $1 AND establishment_id = $2 AND is_active = TRUE`,
        [userId, row.placeId],
      );
      if (exists.rows.length > 0) {
        console.log('OK (já tem permissão):', email, 'place', row.placeId);
        continue;
      }
      console.log(dryRun ? 'DRY-RUN inseriria' : 'Inserindo', email, '→ place', row.placeId);
      if (!dryRun) {
        await pool.query(
          `INSERT INTO user_establishment_permissions (
            user_id, user_email, establishment_id,
            can_edit_os, can_edit_operational_detail, can_view_os, can_download_os,
            can_view_operational_detail, can_create_os, can_create_operational_detail,
            can_manage_reservations, can_manage_checkins, can_view_reports,
            can_create_edit_reservations, can_view_cardapio, can_create_cardapio,
            can_edit_cardapio, can_delete_cardapio, is_active
          ) VALUES (
            $1, $2, $3,
            true, true, true, true, true, true, true,
            true, true, true, true, true, true, true, true, true
          )`,
          [userId, email, row.placeId],
        );
      }
    }
    console.log('Concluído.');
  } catch (e) {
    console.error('Erro:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();

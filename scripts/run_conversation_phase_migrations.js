require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

const MIGRATIONS = [
  '2026-05-14_whatsapp_webhook_reliability.sql',
  '2026-05-15_conversation_state_phase1.sql',
  '2026-05-16_customer_operational_profile.sql',
  '2026-05-17_conversation_state_commercial_phase3.sql',
  '2026-05-18_conversation_metrics_lgpd_phase4.sql',
];

async function main() {
  for (const file of MIGRATIONS) {
    const migrationPath = path.join(__dirname, '..', 'migrations', file);
    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log(`Executando ${file}...`);
    await pool.query(sql);
    console.log(`OK: ${file}`);
  }

  const verification = await pool.query(`
    SELECT
      to_regclass('meu_backup_db.whatsapp_message_dedup') AS dedup,
      to_regclass('meu_backup_db.conversation_state') AS conversation_state,
      to_regclass('meu_backup_db.customer_operational_profile') AS customer_operational_profile,
      to_regclass('meu_backup_db.reservation_whatsapp_followups') AS reservation_whatsapp_followups,
      to_regclass('meu_backup_db.conversation_funnel_events') AS conversation_funnel_events
  `);

  console.log('Verificacao:', verification.rows[0]);
  await pool.end();
}

main().catch((error) => {
  console.error('Falha na migration:', error.message);
  process.exit(1);
});

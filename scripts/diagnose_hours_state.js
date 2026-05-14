require('dotenv').config();
const pool = require('../config/database');
const businessRulesEngine = require('../services/businessRulesEngine');

async function main() {
  const weekly = await pool.query(
    `SELECT establishment_id, weekday, is_open, start_time, end_time,
            second_start_time, second_end_time
       FROM restaurant_reservation_operating_hours
      ORDER BY establishment_id, weekday`
  );
  console.log('weekly_rows', weekly.rows.length);
  console.log(JSON.stringify(weekly.rows, null, 2));

  const overrides = await pool.query(
    `SELECT establishment_id, override_date::text AS override_date, is_open, start_time, end_time
       FROM restaurant_reservation_date_overrides
      WHERE override_date >= CURRENT_DATE - 1
      ORDER BY override_date, establishment_id
      LIMIT 30`
  );
  console.log('overrides', JSON.stringify(overrides.rows, null, 2));

  for (const id of [1, 4, 7, 8, 9, 10]) {
    for (const date of ['2026-05-16', '2026-05-17', '2026-05-14']) {
      const windows = await businessRulesEngine.getOperatingWindowsForDate(pool, id, date);
      console.log('windows', { id, date, windows });
    }
  }

  const state = await pool.query(
    `SELECT cs.current_step, cs.collected_fields, cs.missing_fields, cs.handoff_recommended, c.wa_id
       FROM conversation_state cs
       JOIN whatsapp_conversations c ON c.id = cs.conversation_id
      WHERE c.wa_id = $1`,
    ['5511943501097']
  );
  console.log('state', JSON.stringify(state.rows[0], null, 2));

  const messages = await pool.query(
    `SELECT wm.direction, wm.body, wm.intent, wm.created_at
       FROM whatsapp_messages wm
       JOIN whatsapp_conversations c ON c.id = wm.conversation_id
      WHERE c.wa_id = $1
      ORDER BY wm.id DESC
      LIMIT 12`,
    ['5511943501097']
  );
  console.log('messages', JSON.stringify(messages.rows, null, 2));

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

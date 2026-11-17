/**
 * Corrige conversas cujo updated_at foi empurrado para NOW() pelo import
 * de histórico Wame, sem inbound recente — o painel mostra a conversa no topo
 * e bloqueia resposta (fora da janela Meta de 24h).
 *
 * Uso: node scripts/realignWhatsappActivityAfterHistory.js [establishment_id]
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

async function main() {
  await pool.query('SET search_path TO meu_backup_db, public');
  const establishmentId = Number(process.argv[2]);
  const params = [];
  let estFilter = '';
  if (Number.isFinite(establishmentId) && establishmentId > 0) {
    params.push(establishmentId);
    estFilter = `AND c.establishment_id = $${params.length}`;
  }

  const result = await pool.query(
    `UPDATE whatsapp_conversations c
        SET updated_at = COALESCE(sub.last_inbound, sub.last_any)
       FROM (
         SELECT m.conversation_id,
                MAX(m.created_at) FILTER (WHERE m.direction = 'inbound') AS last_inbound,
                MAX(m.created_at) AS last_any
           FROM whatsapp_messages m
           JOIN whatsapp_conversations cx ON cx.id = m.conversation_id
          GROUP BY m.conversation_id
       ) sub
      WHERE c.id = sub.conversation_id
        ${estFilter}
        AND COALESCE(sub.last_inbound, sub.last_any) IS NOT NULL
        AND c.updated_at > COALESCE(sub.last_inbound, sub.last_any) + INTERVAL '1 minute'
      RETURNING c.id, c.wa_id, c.establishment_id, c.updated_at`,
    params
  );

  console.log(`Realinhadas: ${result.rowCount}`);
  for (const row of result.rows.slice(0, 30)) {
    console.log(JSON.stringify(row));
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

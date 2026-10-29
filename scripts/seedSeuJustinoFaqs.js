/**
 * Grava as Informações adicionais do Seu Justino (places.id = 1).
 * Uso: node scripts/seedSeuJustinoFaqs.js
 */
require('dotenv').config();
const pool = require('../config/database');
const {
  SEU_JUSTINO_ESTABLISHMENT_ID,
  SEU_JUSTINO_FAQS,
  LEGACY_TOPICS_TO_RETIRE,
} = require('../services/agent/seuJustinoFaqCatalog');

async function tableColumns(tableName) {
  const probe = await pool.query(`SELECT * FROM ${tableName} LIMIT 0`);
  return new Set(probe.fields.map((field) => field.name));
}

async function main() {
  const place = await pool.query('SELECT id, name FROM places WHERE id = $1 LIMIT 1', [
    SEU_JUSTINO_ESTABLISHMENT_ID,
  ]);
  if (!place.rows[0]) {
    throw new Error(`Place ${SEU_JUSTINO_ESTABLISHMENT_ID} não encontrado.`);
  }

  const faqColumns = await tableColumns('establishment_faq');
  const placeColumns = await tableColumns('places');
  const hasCategory = faqColumns.has('category');
  const hasOrg = faqColumns.has('organization_id') && placeColumns.has('organization_id');
  let organizationId = null;
  if (hasOrg) {
    const org = await pool.query(
      'SELECT organization_id FROM places WHERE id = $1 LIMIT 1',
      [SEU_JUSTINO_ESTABLISHMENT_ID]
    );
    organizationId = org.rows[0]?.organization_id || null;
  }

  let written = 0;
  for (const faq of SEU_JUSTINO_FAQS) {
    if (hasCategory && hasOrg && organizationId) {
      await pool.query(
        `INSERT INTO establishment_faq
           (establishment_id, topic, answer, category, is_active, organization_id, updated_at)
         VALUES ($1, $2, $3, $4, TRUE, $5, NOW())
         ON CONFLICT (establishment_id, topic)
         DO UPDATE SET
           answer = EXCLUDED.answer,
           category = EXCLUDED.category,
           is_active = TRUE,
           updated_at = NOW()`,
        [SEU_JUSTINO_ESTABLISHMENT_ID, faq.topic, faq.answer, faq.category, organizationId]
      );
    } else if (hasCategory) {
      await pool.query(
        `INSERT INTO establishment_faq
           (establishment_id, topic, answer, category, is_active, updated_at)
         VALUES ($1, $2, $3, $4, TRUE, NOW())
         ON CONFLICT (establishment_id, topic)
         DO UPDATE SET
           answer = EXCLUDED.answer,
           category = EXCLUDED.category,
           is_active = TRUE,
           updated_at = NOW()`,
        [SEU_JUSTINO_ESTABLISHMENT_ID, faq.topic, faq.answer, faq.category]
      );
    } else {
      await pool.query(
        `INSERT INTO establishment_faq
           (establishment_id, topic, answer, is_active, updated_at)
         VALUES ($1, $2, $3, TRUE, NOW())
         ON CONFLICT (establishment_id, topic)
         DO UPDATE SET
           answer = EXCLUDED.answer,
           is_active = TRUE,
           updated_at = NOW()`,
        [SEU_JUSTINO_ESTABLISHMENT_ID, faq.topic, faq.answer]
      );
    }
    written += 1;
  }

  const retired = await pool.query(
    `UPDATE establishment_faq
        SET is_active = FALSE, updated_at = NOW()
      WHERE establishment_id = $1
        AND topic = ANY($2::varchar[])
        AND is_active = TRUE`,
    [SEU_JUSTINO_ESTABLISHMENT_ID, LEGACY_TOPICS_TO_RETIRE]
  );

  console.log(
    `Seu Justino (${place.rows[0].name}): ${written} informações gravadas, ${retired.rowCount} tópicos antigos desativados.`
  );
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

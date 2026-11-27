/**
 * Sincroniza e separa Regras da Casa (ai_assistant_settings.custom_rules)
 * e Informações adicionais (establishment_faq) de todos os estabelecimentos.
 *
 * - Regra de postura/condução -> ai_assistant_settings.custom_rules
 * - Fato atualizado para o cliente -> establishment_faq (is_active = TRUE)
 * - Remove fichas inativas, vencidas, contraditórias, duplicadas e órfãs
 * - Preserva avisos de bloqueio de agenda vigentes (aviso_bloqueio_agenda_*)
 * - Preserva assistant_name, ai_globally_enabled e behavior_config atuais
 *
 * Uso: DATABASE_URL="..." node scripts/syncAllEstablishmentsAiKnowledge.js
 */
'use strict';

require('dotenv').config();
const { Client } = require('pg');
const { HOUSE_RULES_BY_ESTABLISHMENT } = require('../services/agent/houseRulesCatalog');
const { SEU_JUSTINO_ESTABLISHMENT_ID, SEU_JUSTINO_FAQS } = require('../services/agent/seuJustinoFaqCatalog');
const { PRACINHA_ESTABLISHMENT_ID, PRACINHA_FAQS } = require('../services/agent/pracinhaFaqCatalog');
const { HIGHLINE_ESTABLISHMENT_ID, HIGHLINE_FAQS } = require('../services/agent/highlineFaqCatalog');
const {
  RESERVA_ROOFTOP_ESTABLISHMENT_ID,
  RESERVA_PINHEIROS_ESTABLISHMENT_ID,
  RESERVA_ROOFTOP_FAQS,
  RESERVA_PINHEIROS_FAQS,
} = require('../services/agent/reservaRooftopFaqCatalog');

const FAQ_CATALOGS = [
  { establishmentId: SEU_JUSTINO_ESTABLISHMENT_ID, name: 'Seu Justino', faqs: SEU_JUSTINO_FAQS },
  { establishmentId: HIGHLINE_ESTABLISHMENT_ID, name: 'HighLine', faqs: HIGHLINE_FAQS },
  { establishmentId: PRACINHA_ESTABLISHMENT_ID, name: 'Pracinha do Seu Justino', faqs: PRACINHA_FAQS },
  { establishmentId: RESERVA_ROOFTOP_ESTABLISHMENT_ID, name: 'Reserva Rooftop', faqs: RESERVA_ROOFTOP_FAQS },
  { establishmentId: RESERVA_PINHEIROS_ESTABLISHMENT_ID, name: 'Reserva Pinheiros', faqs: RESERVA_PINHEIROS_FAQS },
];

async function getTableColumns(client, tableName) {
  const probe = await client.query(`SELECT * FROM ${tableName} LIMIT 0`);
  return new Set(probe.fields.map((field) => field.name));
}

async function buildOrgMap(client, placesCols, ids) {
  const map = new Map();
  for (const id of ids) {
    let orgId = null;
    try {
      const { resolveOrganizationIdForEstablishment } = require('../tenancy/resolveOrganizationId');
      orgId = await resolveOrganizationIdForEstablishment(client, id);
    } catch (_err) {
      orgId = null;
    }
    if (!orgId && placesCols.has('organization_id')) {
      const res = await client.query('SELECT organization_id FROM places WHERE id = $1 LIMIT 1', [
        id,
      ]);
      orgId = res.rows[0]?.organization_id || null;
    }
    map.set(Number(id), orgId);
  }
  return map;
}

async function syncHouseRules(client, { orgMap, settingsCols }) {
  const hasSettingsOrg = settingsCols.has('organization_id');
  const report = [];
  for (const [rawId, cfg] of Object.entries(HOUSE_RULES_BY_ESTABLISHMENT)) {
    const establishmentId = Number(rawId);
    const orgId = hasSettingsOrg ? orgMap.get(establishmentId) || null : null;
    const existing = await client.query(
      'SELECT establishment_id FROM ai_assistant_settings WHERE establishment_id = $1 LIMIT 1',
      [establishmentId]
    );

    if (existing.rows[0]) {
      if (hasSettingsOrg && orgId) {
        await client.query(
          `UPDATE ai_assistant_settings
              SET custom_rules = $2::jsonb,
                  use_bullets = $3,
                  use_emojis = $4,
                  organization_id = COALESCE(organization_id, $5),
                  updated_at = NOW()
            WHERE establishment_id = $1`,
          [
            establishmentId,
            JSON.stringify(cfg.custom_rules),
            Boolean(cfg.use_bullets),
            Boolean(cfg.use_emojis),
            orgId,
          ]
        );
      } else {
        await client.query(
          `UPDATE ai_assistant_settings
              SET custom_rules = $2::jsonb,
                  use_bullets = $3,
                  use_emojis = $4,
                  updated_at = NOW()
            WHERE establishment_id = $1`,
          [
            establishmentId,
            JSON.stringify(cfg.custom_rules),
            Boolean(cfg.use_bullets),
            Boolean(cfg.use_emojis),
          ]
        );
      }
    } else if (hasSettingsOrg && orgId) {
      await client.query(
        `INSERT INTO ai_assistant_settings
           (establishment_id, is_active, custom_rules, use_bullets, use_emojis, ai_globally_enabled, organization_id, updated_at)
         VALUES ($1, TRUE, $2::jsonb, $3, $4, FALSE, $5, NOW())`,
        [
          establishmentId,
          JSON.stringify(cfg.custom_rules),
          Boolean(cfg.use_bullets),
          Boolean(cfg.use_emojis),
          orgId,
        ]
      );
    } else {
      await client.query(
        `INSERT INTO ai_assistant_settings
           (establishment_id, is_active, custom_rules, use_bullets, use_emojis, ai_globally_enabled, updated_at)
         VALUES ($1, TRUE, $2::jsonb, $3, $4, FALSE, NOW())`,
        [
          establishmentId,
          JSON.stringify(cfg.custom_rules),
          Boolean(cfg.use_bullets),
          Boolean(cfg.use_emojis),
        ]
      );
    }
    report.push({ establishmentId, rules: cfg.custom_rules.length });
  }
  return report;
}

async function syncEstablishmentFaqs(client, { establishmentId, name, faqs }, { orgMap, faqCols }) {
  const hasFaqOrg = faqCols.has('organization_id');
  const hasCategory = faqCols.has('category');
  const orgId = hasFaqOrg ? orgMap.get(establishmentId) || null : null;
  const allowedTopics = faqs.map((f) => f.topic);

  for (const faq of faqs) {
    if (hasCategory && hasFaqOrg && orgId) {
      await client.query(
        `INSERT INTO establishment_faq
           (establishment_id, topic, answer, category, is_active, organization_id, updated_at)
         VALUES ($1, $2, $3, $4, TRUE, $5, NOW())
         ON CONFLICT (establishment_id, topic)
         DO UPDATE SET
           answer = EXCLUDED.answer,
           category = EXCLUDED.category,
           is_active = TRUE,
           organization_id = COALESCE(establishment_faq.organization_id, EXCLUDED.organization_id),
           updated_at = NOW()`,
        [establishmentId, faq.topic, faq.answer, faq.category || 'geral', orgId]
      );
    } else if (hasCategory) {
      await client.query(
        `INSERT INTO establishment_faq
           (establishment_id, topic, answer, category, is_active, updated_at)
         VALUES ($1, $2, $3, $4, TRUE, NOW())
         ON CONFLICT (establishment_id, topic)
         DO UPDATE SET
           answer = EXCLUDED.answer,
           category = EXCLUDED.category,
           is_active = TRUE,
           updated_at = NOW()`,
        [establishmentId, faq.topic, faq.answer, faq.category || 'geral']
      );
    } else {
      await client.query(
        `INSERT INTO establishment_faq
           (establishment_id, topic, answer, is_active, updated_at)
         VALUES ($1, $2, $3, TRUE, NOW())
         ON CONFLICT (establishment_id, topic)
         DO UPDATE SET
           answer = EXCLUDED.answer,
           is_active = TRUE,
           updated_at = NOW()`,
        [establishmentId, faq.topic, faq.answer]
      );
    }
  }

  // Apaga definitivamente fichas inativas, vencidas, duplicadas ou regras antigas
  // que não estão no catálogo oficial (preservando apenas bloqueios de agenda vigentes).
  const deleted = await client.query(
    `DELETE FROM establishment_faq
      WHERE establishment_id = $1
        AND NOT (topic = ANY($2::varchar[]))
        AND topic NOT LIKE 'aviso_bloqueio_agenda_%'
      RETURNING topic`,
    [establishmentId, allowedTopics]
  );

  return {
    establishmentId,
    name,
    upserted: faqs.length,
    deletedCount: deleted.rowCount,
    deletedTopics: deleted.rows.map((r) => r.topic),
  };
}

async function fixMinorEstablishments(client) {
  // Remove FAQs órfãs de estabelecimentos que não existem mais em places (ex.: id = 2).
  const orphanRes = await client.query(
    `DELETE FROM establishment_faq f
      WHERE NOT EXISTS (SELECT 1 FROM places p WHERE p.id = f.establishment_id)
      RETURNING f.establishment_id, f.topic`
  );

  // Corrige erros de digitação no Oh Freguês (id = 4).
  const ohFreguesFixes = [
    [
      'areas_mesas_camarotes_diferenca',
      'O Oh Freguês possui áreas com ambientes distintos. Posso listar as opções ativas e ajudar a escolher a melhor experiência.',
    ],
    [
      'beneficios_aniversario',
      'Comemoramos aniversários com atenção especial. Me conte a data, o horário e quantas pessoas para orientarmos a melhor experiência.',
    ],
    [
      'dress_code',
      'O dress code é casual elegante. Evitamos chinelos e bermudas rasgadas.',
    ],
  ];
  for (const [topic, answer] of ohFreguesFixes) {
    await client.query(
      `UPDATE establishment_faq
          SET answer = $3, updated_at = NOW()
        WHERE establishment_id = $1 AND topic = $2`,
      [4, topic, answer]
    );
  }

  return { orphansDeleted: orphanRes.rows };
}

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error('Defina DATABASE_URL antes de rodar o script.');
  }

  const useSsl = !/localhost|127\.0\.0\.1/.test(connectionString);
  const client = new Client({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  });

  await client.connect();
  try {
    const placesCols = await getTableColumns(client, 'places');
    const settingsCols = await getTableColumns(client, 'ai_assistant_settings');
    const faqCols = await getTableColumns(client, 'establishment_faq');
    const allIds = Array.from(
      new Set([
        ...Object.keys(HOUSE_RULES_BY_ESTABLISHMENT).map(Number),
        ...FAQ_CATALOGS.map((c) => c.establishmentId),
      ])
    );
    const orgMap = await buildOrgMap(client, placesCols, allIds);

    await client.query('BEGIN');
    const rulesReport = await syncHouseRules(client, { orgMap, settingsCols });
    const faqsReport = [];
    for (const item of FAQ_CATALOGS) {
      faqsReport.push(await syncEstablishmentFaqs(client, item, { orgMap, faqCols }));
    }
    const extras = await fixMinorEstablishments(client);
    await client.query('COMMIT');

    console.log('=== REGRAS DA CASA (custom_rules) ===');
    for (const r of rulesReport) {
      console.log(`- establishment_id=${r.establishmentId}: ${r.rules} regras gravadas`);
    }
    console.log('\n=== INFORMAÇÕES ADICIONAIS (establishment_faq) ===');
    for (const f of faqsReport) {
      console.log(
        `- ${f.name} (id=${f.establishmentId}): ${f.upserted} informações ativas, ${f.deletedCount} antigas/conflitantes removidas`
      );
    }
    if (extras.orphansDeleted.length) {
      console.log('\n=== ÓRFÃS REMOVIDAS ===', extras.orphansDeleted);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[syncAllEstablishmentsAiKnowledge] ERRO:', err.message);
    process.exit(1);
  });
}

module.exports = { main };

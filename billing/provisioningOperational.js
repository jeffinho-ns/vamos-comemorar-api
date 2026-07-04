'use strict';

const { seedEstablishmentConfig } = require('./onboardingTemplates');

const STARTER_FAQ_TOPICS = [
  {
    topic: 'horario_funcionamento',
    answer:
      'Consulte a disponibilidade na data desejada. Nossa equipe confirma horários especiais e eventos.',
    category: 'geral',
  },
  {
    topic: 'cardapio',
    answer: 'O cardápio digital está disponível no site. Peça o link se precisar.',
    category: 'cardapio',
  },
  {
    topic: 'reservas',
    answer:
      'Para reservar, informe data, horário e número de pessoas. Confirmamos conforme disponibilidade.',
    category: 'reserva',
  },
  {
    topic: 'areas',
    answer: 'Temos áreas com ambientes distintos. Posso ajudar a escolher a melhor opção para seu grupo.',
    category: 'geral',
  },
];

const STARTER_TABLES = [
  { table_number: '1', capacity: 4 },
  { table_number: '2', capacity: 4 },
  { table_number: '3', capacity: 6 },
  { table_number: '4', capacity: 8 },
];

async function tableHasColumn(client, tableName, columnName) {
  const { rows } = await client.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'meu_backup_db'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1`,
    [tableName, columnName],
  );
  return rows.length > 0;
}

async function insertPlace(client, { slug, name, organizationId }) {
  const hasOrgCol = await tableHasColumn(client, 'places', 'organization_id');
  if (hasOrgCol) {
    const { rows } = await client.query(
      `INSERT INTO places (slug, name, email, description, status, visible, organization_id)
       VALUES ($1, $2, NULL, $3, 'active', 1, $4)
       RETURNING id`,
      [slug, name, `Estabelecimento ${name}`, organizationId],
    );
    return rows[0].id;
  }
  const { rows } = await client.query(
    `INSERT INTO places (slug, name, email, description, status, visible)
     VALUES ($1, $2, NULL, $3, 'active', 1)
     RETURNING id`,
    [slug, name, `Estabelecimento ${name}`],
  );
  return rows[0].id;
}

async function insertBar(client, { slug, name, organizationId }) {
  const hasOrgCol = await tableHasColumn(client, 'bars', 'organization_id');
  if (hasOrgCol) {
    const { rows } = await client.query(
      `INSERT INTO bars (name, slug, description, organization_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [name, slug, `Cardápio ${name}`, organizationId],
    );
    return rows[0].id;
  }
  const { rows } = await client.query(
    `INSERT INTO bars (name, slug, description)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [name, slug, `Cardápio ${name}`],
  );
  return rows[0].id;
}

async function seedStarterFaqs(client, placeId, organizationId) {
  const hasOrgCol = await tableHasColumn(client, 'establishment_faq', 'organization_id');
  for (const faq of STARTER_FAQ_TOPICS) {
    if (hasOrgCol) {
      await client.query(
        `INSERT INTO establishment_faq (establishment_id, topic, answer, category, is_active, organization_id, updated_at)
         SELECT $1, $2, $3, $4, TRUE, $5, now()
          WHERE NOT EXISTS (
            SELECT 1 FROM establishment_faq WHERE establishment_id = $1 AND topic = $2
          )`,
        [placeId, faq.topic, faq.answer, faq.category, organizationId],
      );
    } else {
      await client.query(
        `INSERT INTO establishment_faq (establishment_id, topic, answer, category, is_active, updated_at)
         SELECT $1, $2, $3, $4, TRUE, now()
          WHERE NOT EXISTS (
            SELECT 1 FROM establishment_faq WHERE establishment_id = $1 AND topic = $2
          )`,
        [placeId, faq.topic, faq.answer, faq.category],
      );
    }
  }
}

async function seedStarterAreaAndTables(client, { establishmentName, organizationId }) {
  const areaName = `${establishmentName} — Salão Principal`;
  const hasOrgCol = await tableHasColumn(client, 'restaurant_areas', 'organization_id');

  let areaId;
  if (hasOrgCol) {
    const existing = await client.query(
      `SELECT id FROM restaurant_areas WHERE name = $1 AND organization_id = $2 LIMIT 1`,
      [areaName, organizationId],
    );
    if (existing.rows.length) {
      areaId = existing.rows[0].id;
    } else {
      const ins = await client.query(
        `INSERT INTO restaurant_areas (name, description, capacity_lunch, capacity_dinner, is_active, organization_id)
         VALUES ($1, $2, 80, 120, TRUE, $3)
         RETURNING id`,
        [areaName, 'Área principal provisionada automaticamente.', organizationId],
      );
      areaId = ins.rows[0].id;
    }
  } else {
    const existing = await client.query(`SELECT id FROM restaurant_areas WHERE name = $1 LIMIT 1`, [
      areaName,
    ]);
    if (existing.rows.length) {
      areaId = existing.rows[0].id;
    } else {
      const ins = await client.query(
        `INSERT INTO restaurant_areas (name, description, capacity_lunch, capacity_dinner, is_active)
         VALUES ($1, $2, 80, 120, TRUE)
         RETURNING id`,
        [areaName, 'Área principal provisionada automaticamente.'],
      );
      areaId = ins.rows[0].id;
    }
  }

  const tablesHasOrg = await tableHasColumn(client, 'restaurant_tables', 'organization_id');
  for (const table of STARTER_TABLES) {
    const exists = await client.query(
      `SELECT id FROM restaurant_tables WHERE area_id = $1 AND table_number = $2 LIMIT 1`,
      [areaId, table.table_number],
    );
    if (exists.rows.length) continue;

    if (tablesHasOrg) {
      await client.query(
        `INSERT INTO restaurant_tables (area_id, table_number, capacity, is_active, organization_id)
         VALUES ($1, $2, $3, TRUE, $4)`,
        [areaId, table.table_number, table.capacity, organizationId],
      );
    } else {
      await client.query(
        `INSERT INTO restaurant_tables (area_id, table_number, capacity, is_active)
         VALUES ($1, $2, $3, TRUE)`,
        [areaId, table.table_number, table.capacity],
      );
    }
  }

  return { areaId, areaName };
}

async function mergeEstablishmentOperationalConfig(client, establishmentId, { slug, barId }) {
  await client.query(
    `UPDATE meu_backup_db.establishments
        SET config = COALESCE(config, '{}'::jsonb) || $2::jsonb,
            updated_at = now()
      WHERE id = $1`,
    [
      establishmentId,
      JSON.stringify({
        profile: 'generic',
        rules: {
          reservations: { maxPartySize: 20 },
          cardapio: { barId: Number(barId) || null },
        },
        onboarding: {
          completedSteps: ['establishment_created', 'area_created', 'faq_seeded'],
        },
      }),
    ],
  );
}

/**
 * Cria establishment canônico + place/bar operacionais + área/mesas + FAQ mínimo.
 */
async function provisionOperationalEstablishment(client, { org, slug, establishmentName }) {
  const estName = establishmentName || org.name;

  const estIns = await client.query(
    `INSERT INTO meu_backup_db.establishments (organization_id, slug, name, status)
     VALUES ($1, $2, $3, 'active')
     RETURNING id`,
    [org.id, slug, estName],
  );
  const establishmentId = estIns.rows[0].id;

  const placeId = await insertPlace(client, { slug, name: estName, organizationId: org.id });
  const barId = await insertBar(client, { slug, name: estName, organizationId: org.id });

  await client.query(
    `UPDATE meu_backup_db.establishments
        SET legacy_place_id = $2,
            legacy_bar_id = $3,
            updated_at = now()
      WHERE id = $1`,
    [establishmentId, placeId, barId],
  );

  await seedEstablishmentConfig(client, establishmentId, slug);
  await mergeEstablishmentOperationalConfig(client, establishmentId, { slug, barId });

  const { areaId, areaName } = await seedStarterAreaAndTables(client, {
    establishmentName: estName,
    organizationId: org.id,
  });

  await seedStarterFaqs(client, placeId, org.id);

  return {
    establishmentId,
    legacyPlaceId: placeId,
    legacyBarId: barId,
    areaId,
    areaName,
  };
}

module.exports = {
  STARTER_FAQ_TOPICS,
  provisionOperationalEstablishment,
};

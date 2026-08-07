// Migração: refresh áreas/mesas operacionais do Highline (PostgreSQL)
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { requireDatabaseUrl } = require('../config/resolveDatabaseUrl');

const HIGHLINE_ESTABLISHMENT_ID = Number(process.env.HIGHLINE_ESTABLISHMENT_ID || 7);
const ROTATIVO_AREA_ID = Number(process.env.HIGHLINE_ROTATIVO_AREA_ID || 7001);

const CATALOG = [
  // DECK - Mesas
  { area_id: 2, table_number: '01', capacity: 8, table_type: 'mesa', description: 'Deck - Mesa 01' },
  { area_id: 2, table_number: '02', capacity: 8, table_type: 'mesa', description: 'Deck - Mesa 02' },
  { area_id: 2, table_number: '03', capacity: 8, table_type: 'mesa', description: 'Deck - Mesa 03' },
  { area_id: 2, table_number: '04', capacity: 8, table_type: 'mesa', description: 'Deck - Mesa 04' },
  // DECK - Redondas
  { area_id: 2, table_number: '09', capacity: 6, table_type: 'mesa_redonda', description: 'Deck - Mesa Redonda 09' },
  { area_id: 2, table_number: '10', capacity: 6, table_type: 'mesa_redonda', description: 'Deck - Mesa Redonda 10' },
  { area_id: 2, table_number: '11', capacity: 6, table_type: 'mesa_redonda', description: 'Deck - Mesa Redonda 11' },
  { area_id: 2, table_number: '12', capacity: 6, table_type: 'mesa_redonda', description: 'Deck - Mesa Redonda 12' },
  { area_id: 2, table_number: '13', capacity: 2, table_type: 'mesa_redonda', description: 'Deck - Mesa Redonda 13' },
  { area_id: 2, table_number: '14', capacity: 2, table_type: 'mesa_redonda', description: 'Deck - Mesa Redonda 14' },
  // BAR CENTRAL
  { area_id: 2, table_number: '15', capacity: 2, table_type: 'bistro', description: 'Bar Central - Bistrô Espera 15 (consultar Roni)' },
  { area_id: 2, table_number: '16', capacity: 2, table_type: 'bistro', description: 'Bar Central - Bistrô Espera 16 (consultar Roni)' },
  { area_id: 2, table_number: '17', capacity: 2, table_type: 'bistro', description: 'Bar Central - Bistrô Espera 17 (consultar Roni)' },
  // BALADA - Bistrôs
  ...['20', '21', '22', '23', '24', '25', '26', '27'].map((n) => ({
    area_id: 2, table_number: n, capacity: 4, table_type: 'bistro', description: `Balada - Bistrô ${n}`,
  })),
  // BALADA - Camarotes
  { area_id: 2, table_number: '30', capacity: 6, table_type: 'camarote', description: 'Balada - Camarote 30' },
  { area_id: 2, table_number: '31', capacity: 6, table_type: 'camarote', description: 'Balada - Camarote 31' },
  { area_id: 2, table_number: '32', capacity: 6, table_type: 'camarote', description: 'Balada - Camarote 32' },
  { area_id: 2, table_number: '33', capacity: 8, table_type: 'camarote', description: 'Balada - Camarote 33' },
  { area_id: 2, table_number: '34', capacity: 8, table_type: 'camarote', description: 'Balada - Camarote 34 (Sócios — avisar Roni)' },
  { area_id: 2, table_number: '35', capacity: 8, table_type: 'camarote', description: 'Balada - Camarote 35' },
  // ROOFTOP - Lounges
  ...['40', '41', '42', '43'].map((n) => ({
    area_id: 5, table_number: n, capacity: 6, table_type: 'lounge', description: `Rooftop - Lounge ${n}`,
  })),
  // ROOFTOP - Mesas
  { area_id: 5, table_number: '50', capacity: 2, table_type: 'mesa', description: 'Rooftop - Mesa 50' },
  { area_id: 5, table_number: '51', capacity: 2, table_type: 'mesa', description: 'Rooftop - Mesa 51' },
  { area_id: 5, table_number: '52', capacity: 2, table_type: 'mesa', description: 'Rooftop - Mesa 52' },
  { area_id: 5, table_number: '53', capacity: 2, table_type: 'mesa', description: 'Rooftop - Mesa 53' },
  { area_id: 5, table_number: '54', capacity: 4, table_type: 'mesa', description: 'Rooftop - Mesa 54' },
  { area_id: 5, table_number: '55', capacity: 4, table_type: 'mesa', description: 'Rooftop - Mesa 55' },
  { area_id: 5, table_number: '56', capacity: 4, table_type: 'mesa', description: 'Rooftop - Mesa 56' },
  { area_id: 5, table_number: '74', capacity: 4, table_type: 'mesa', description: 'Rooftop - Mesa 74' },
  { area_id: 5, table_number: '75', capacity: 4, table_type: 'mesa', description: 'Rooftop - Mesa 75' },
  { area_id: 5, table_number: '76', capacity: 4, table_type: 'mesa', description: 'Rooftop - Mesa 76' },
  // ROOFTOP - Bangalôs
  ...['60', '61', '62', '63', '64', '65'].map((n) => ({
    area_id: 5, table_number: n, capacity: 8, table_type: 'bangalo', description: `Rooftop - Bangalô ${n}`,
  })),
  // ROOFTOP - Bistrôs
  ...['70', '71', '72', '73'].map((n) => ({
    area_id: 5, table_number: n, capacity: 2, table_type: 'bistro', description: `Rooftop - Bistrô ${n}`,
  })),
  // ROTATIVO - Bistrôs de Espera
  ...['01', '02', '03', '04', '05', '06', '07', '08'].map((n) => ({
    area_id: ROTATIVO_AREA_ID,
    table_number: n,
    capacity: 4,
    table_type: 'bistro_espera',
    description: `Rotativo - Bistrô de Espera ${n}`,
  })),
  // ROTATIVO - Lista de Espera
  ...['L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L08', 'L09', 'L10'].map((n, idx) => ({
    area_id: ROTATIVO_AREA_ID,
    table_number: n,
    capacity: 4,
    table_type: 'lista_espera',
    description: `Rotativo - Lista de Espera ${String(idx + 1).padStart(2, '0')}`,
  })),
];

const RETIRED = ['05', '06', '07', '08', '44', '45', '46', '47'];

async function upsertTable(client, row) {
  const existing = await client.query(
    `SELECT id FROM restaurant_tables
      WHERE area_id = $1 AND table_number = $2
      LIMIT 1`,
    [row.area_id, row.table_number]
  );
  if (existing.rows[0]) {
    await client.query(
      `UPDATE restaurant_tables
          SET capacity = $1,
              table_type = $2,
              description = $3,
              is_active = TRUE,
              establishment_id = COALESCE(establishment_id, $4),
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $5`,
      [row.capacity, row.table_type, row.description, HIGHLINE_ESTABLISHMENT_ID, existing.rows[0].id]
    );
    return 'updated';
  }
  await client.query(
    `INSERT INTO restaurant_tables
       (area_id, table_number, capacity, table_type, description, is_active, establishment_id)
     VALUES ($1, $2, $3, $4, $5, TRUE, $6)`,
    [
      row.area_id,
      row.table_number,
      row.capacity,
      row.table_type,
      row.description,
      HIGHLINE_ESTABLISHMENT_ID,
    ]
  );
  return 'inserted';
}

async function runMigration() {
  let pool;
  try {
    const connectionString = requireDatabaseUrl();
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes('render.com') ? { rejectUnauthorized: false } : undefined,
    });
    console.log('Conectando ao banco...');
    await pool.query('SELECT NOW()');
    console.log('Conectado.');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Área Rotativo
      const areaExists = await client.query(
        'SELECT id FROM restaurant_areas WHERE id = $1 LIMIT 1',
        [ROTATIVO_AREA_ID]
      );
      // Deck (2) e Rooftop (5) precisam pertencer ao Highline — senão a API rejeita
      // criar_pre_reserva com "area_id não pertence ao estabelecimento".
      for (const legacyAreaId of [2, 5]) {
        await client.query(
          `UPDATE restaurant_areas
              SET establishment_id = $1,
                  is_active = TRUE,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = $2`,
          [HIGHLINE_ESTABLISHMENT_ID, legacyAreaId]
        );
      }
      console.log('Áreas 2 (Deck) e 5 (Rooftop) vinculadas ao Highline.');

      if (areaExists.rows[0]) {
        await client.query(
          `UPDATE restaurant_areas
              SET name = 'Rotativo',
                  description = 'Bistrôs de espera e lista de espera do Highline (máx. 4 pessoas)',
                  capacity_lunch = 32,
                  capacity_dinner = 32,
                  is_active = TRUE,
                  establishment_id = $1,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = $2`,
          [HIGHLINE_ESTABLISHMENT_ID, ROTATIVO_AREA_ID]
        );
        console.log(`Área Rotativo ${ROTATIVO_AREA_ID} atualizada.`);
      } else {
        await client.query(
          `INSERT INTO restaurant_areas
             (id, name, description, capacity_lunch, capacity_dinner, is_active, establishment_id)
           VALUES ($1, 'Rotativo',
                   'Bistrôs de espera e lista de espera do Highline (máx. 4 pessoas)',
                   32, 32, TRUE, $2)`,
          [ROTATIVO_AREA_ID, HIGHLINE_ESTABLISHMENT_ID]
        );
        console.log(`Área Rotativo ${ROTATIVO_AREA_ID} criada.`);
      }

      // Sync sequence se existir
      try {
        await client.query(
          `SELECT setval(
             pg_get_serial_sequence('restaurant_areas', 'id'),
             GREATEST((SELECT COALESCE(MAX(id), 1) FROM restaurant_areas), $1)
           )`,
          [ROTATIVO_AREA_ID]
        );
      } catch (seqErr) {
        console.warn('Aviso ao ajustar sequence de restaurant_areas:', seqErr.message);
      }

      let inserted = 0;
      let updated = 0;
      for (const row of CATALOG) {
        const result = await upsertTable(client, row);
        if (result === 'inserted') inserted += 1;
        else updated += 1;
      }
      console.log(`Mesas: ${inserted} inseridas, ${updated} atualizadas.`);

      const retired = await client.query(
        `UPDATE restaurant_tables
            SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
          WHERE area_id IN (2, 5)
            AND table_number = ANY($1::text[])
            AND (establishment_id = $2 OR establishment_id IS NULL)
          RETURNING id, area_id, table_number`,
        [RETIRED, HIGHLINE_ESTABLISHMENT_ID]
      );
      console.log(`Mesas antigas desativadas: ${retired.rowCount}`);

      // Também aplica o SQL de referência (documentação) se existir — sem reexecutar inserts.
      const migrationPath = path.join(
        __dirname,
        '../migrations/2026-08-06_highline_areas_tables_refresh.sql'
      );
      if (fs.existsSync(migrationPath)) {
        console.log('SQL de referência presente:', migrationPath);
      }

      await client.query('COMMIT');
      console.log('Migração Highline áreas/mesas concluída.');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Erro:', err.message);
    process.exit(1);
  } finally {
    if (pool) await pool.end();
  }
}

runMigration();

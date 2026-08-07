/**
 * Corrige ownership das áreas canônicas do Highline (2=Deck/Bar/Balada, 5=Rooftop).
 * Sem establishment_id=7, loadActiveRestaurantAreas só devolve Rotativo (7001)
 * e criar reserva falha com "area_id não pertence ao estabelecimento".
 *
 * Uso: node scripts/fix_highline_area_ownership.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../config/database');

const HIGHLINE_ID = Number(process.env.HIGHLINE_ESTABLISHMENT_ID || 7);
const AREA_UPDATES = [
  {
    id: 2,
    name: 'Área Descoberta',
    description: 'Deck, Bar Central e Balada (Highline) — labels de subárea no código/UI',
  },
  {
    id: 5,
    name: 'Terraço',
    description: 'Rooftop (Highline) — labels de subárea no código/UI',
  },
  {
    id: Number(process.env.HIGHLINE_ROTATIVO_AREA_ID || 7001),
    name: 'Rotativo',
    description: 'Bistrôs de espera e lista de espera do Highline (máx. 4 pessoas)',
  },
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const area of AREA_UPDATES) {
      const result = await client.query(
        `UPDATE restaurant_areas
            SET establishment_id = $1,
                is_active = TRUE,
                description = COALESCE(description, $3),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING id, name, establishment_id, is_active`,
        [HIGHLINE_ID, area.id, area.description]
      );
      if (!result.rows[0]) {
        console.warn(`Área ${area.id} não encontrada — pulando.`);
        continue;
      }
      console.log('OK', result.rows[0]);
    }
    await client.query('COMMIT');

    const check = await client.query(
      `SELECT id, name, establishment_id, is_active
         FROM restaurant_areas
        WHERE id = ANY($1::int[])
        ORDER BY id`,
      [AREA_UPDATES.map((a) => a.id)]
    );
    console.log('Estado final:', check.rows);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Falha:', err.message);
  process.exit(1);
});

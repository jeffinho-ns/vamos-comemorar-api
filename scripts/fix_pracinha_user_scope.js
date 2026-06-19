require('dotenv').config();
const pool = require('../config/database');

const TARGET_EMAIL = 'reservas@pracinhadoseujustino.com.br';
const KEEP_PLACE_ID = 8; // Pracinha do Seu Justino

(async () => {
  try {
    const u = await pool.query(`SELECT id, name, email FROM users WHERE email = $1`, [TARGET_EMAIL]);
    if (!u.rows[0]) {
      console.log('Usuário não encontrado:', TARGET_EMAIL);
      return;
    }
    const userId = u.rows[0].id;
    console.log(`Usuário ${u.rows[0].name} (id=${userId})`);

    const before = await pool.query(
      `SELECT id, establishment_id, is_active FROM user_establishment_permissions WHERE user_id = $1 ORDER BY establishment_id`,
      [userId]
    );
    console.log('Antes:', before.rows.map((r) => `estab=${r.establishment_id} active=${r.is_active}`).join(' | '));

    const upd = await pool.query(
      `UPDATE user_establishment_permissions
          SET is_active = FALSE, updated_at = NOW()
        WHERE user_id = $1 AND establishment_id <> $2 AND is_active = TRUE
        RETURNING id, establishment_id`,
      [userId, KEEP_PLACE_ID]
    );
    console.log('Desativados:', upd.rows.map((r) => `id=${r.id} estab=${r.establishment_id}`).join(', ') || '(nenhum)');

    const after = await pool.query(
      `SELECT establishment_id, is_active FROM user_establishment_permissions WHERE user_id = $1 ORDER BY establishment_id`,
      [userId]
    );
    console.log('Depois:', after.rows.map((r) => `estab=${r.establishment_id} active=${r.is_active}`).join(' | '));
  } catch (e) {
    console.error('Erro:', e.message);
  } finally {
    await pool.end();
  }
})();

require('dotenv').config();
const pool = require('../config/database');

async function run() {
  try {
    await pool.query(`
      ALTER TABLE user_establishment_permissions
      ADD COLUMN IF NOT EXISTS can_view_cardapio BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS can_create_cardapio BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS can_edit_cardapio BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS can_delete_cardapio BOOLEAN DEFAULT TRUE
    `);

    await pool.query(`
      UPDATE user_establishment_permissions
      SET
        can_view_cardapio = COALESCE(can_view_cardapio, TRUE),
        can_create_cardapio = COALESCE(can_create_cardapio, TRUE),
        can_edit_cardapio = COALESCE(can_edit_cardapio, TRUE),
        can_delete_cardapio = COALESCE(can_delete_cardapio, TRUE)
    `);

    console.log('✅ Colunas de cardápio aplicadas no schema da aplicação.');
  } catch (error) {
    console.error('❌ Erro na migração de cardápio:', error.message || error);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

run();

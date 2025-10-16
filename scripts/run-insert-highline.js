/*
  Executa o script de inserção das mesas do Highline usando o pool de conexão existente.
*/

const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function ensureRestaurantTables() {
  const [tables] = await pool.execute("SHOW TABLES LIKE 'restaurant_tables'");
  if (tables.length === 0) {
    console.log('Criando tabela restaurant_tables...');
    await pool.execute(`
      CREATE TABLE restaurant_tables (
        id int(11) NOT NULL AUTO_INCREMENT,
        area_id int(11) NOT NULL,
        table_number varchar(50) NOT NULL,
        capacity int(11) NOT NULL DEFAULT 2,
        table_type varchar(50) DEFAULT NULL,
        description text DEFAULT NULL,
        is_active tinyint(1) DEFAULT 1,
        created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_area_table (area_id, table_number),
        KEY idx_area_id (area_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('Tabela restaurant_tables criada.');
  } else {
    console.log('Tabela restaurant_tables já existe.');
  }
}

async function run() {
  const sqlPath = path.join(__dirname, 'insert_highline_tables.sql');
  if (!fs.existsSync(sqlPath)) {
    throw new Error('Arquivo insert_highline_tables.sql não encontrado.');
  }

  await ensureRestaurantTables();

  const sql = fs.readFileSync(sqlPath, 'utf8');
  // Divide por ponto e vírgula preservando statements não vazios
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`Executando ${statements.length} statements...`);
  try {
    await pool.query('START TRANSACTION');
    for (const stmt of statements) {
      await pool.query(stmt);
    }
    await pool.query('COMMIT');
    console.log('Inserts concluídos com sucesso.');
  } catch (err) {
    console.error('Erro durante execução dos inserts:', err.message);
    try { await pool.query('ROLLBACK'); } catch (_) {}
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run().catch(err => {
  console.error('Falha ao executar:', err);
  process.exit(1);
});

















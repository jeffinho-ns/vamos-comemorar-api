/*
  Executa o script de inserção das mesas do Seu Justino usando o pool de conexão existente.
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
  const sqlPath = path.join(__dirname, 'insert_seu_justino_tables.sql');
  if (!fs.existsSync(sqlPath)) {
    throw new Error('Arquivo insert_seu_justino_tables.sql não encontrado.');
  }

  await ensureRestaurantTables();

  const sql = fs.readFileSync(sqlPath, 'utf8');
  
  // Remove comentários de linha (-- comentário)
  const sqlWithoutComments = sql
    .split('\n')
    .map(line => {
      const commentIndex = line.indexOf('--');
      if (commentIndex >= 0) {
        return line.substring(0, commentIndex);
      }
      return line;
    })
    .join('\n');
  
  // Divide por ponto e vírgula preservando statements não vazios
  const statements = sqlWithoutComments
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.toUpperCase().includes('INSERT'));

  console.log(`Executando ${statements.length} statements...`);
  try {
    await pool.query('START TRANSACTION');
    for (const stmt of statements) {
      if (stmt.trim()) {
        console.log(`Executando: ${stmt.substring(0, 80)}...`);
        await pool.query(stmt);
      }
    }
    await pool.query('COMMIT');
    console.log('✅ Inserts das mesas do Seu Justino concluídos com sucesso!');
  } catch (err) {
    console.error('❌ Erro durante execução dos inserts:', err.message);
    console.error('Stack:', err.stack);
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


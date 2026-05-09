/**
 * Executa migrations/2026-05-09_place_sitio_ilha_separate_from_highline.sql
 * Usa o mesmo pool que o servidor (search_path meu_backup_db, public).
 */
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const pool = require("../config/database");

async function main() {
  const migrationPath = path.join(
    __dirname,
    "../migrations/2026-05-09_place_sitio_ilha_separate_from_highline.sql",
  );
  if (!fs.existsSync(migrationPath)) {
    console.error("Arquivo não encontrado:", migrationPath);
    process.exit(1);
  }
  const sql = fs.readFileSync(migrationPath, "utf8");
  console.log("Executando migração Sitio Ilha...");
  await pool.query(sql);
  const r = await pool.query(
    `SELECT id, slug, name FROM places WHERE lower(slug) = 'sitio-ilha'`,
  );
  console.log("Place Sitio Ilha:", r.rows);
  await pool.end();
  console.log("OK.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

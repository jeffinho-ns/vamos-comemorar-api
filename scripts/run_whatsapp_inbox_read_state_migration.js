#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function main() {
  const sqlPath = path.join(__dirname, '../migrations/2026-07-02_whatsapp_inbox_read_state.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
  console.log('[migration] whatsapp_inbox_read_state aplicada.');
  await pool.end?.();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await pool.end?.();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});

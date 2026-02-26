#!/usr/bin/env node
/**
 * Altera a senha de um usuário (ex.: promoter) pelo email.
 * Uso: node scripts/setPromoterPassword.js "email@exemplo.com" "NovaSenha123"
 */
require('dotenv').config();
const pool = require('../config/database');
const bcrypt = require('bcryptjs');

async function setPromoterPassword(email, newPassword) {
  const client = await pool.connect();
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const result = await client.query(
      'UPDATE users SET password = $1 WHERE email = $2 RETURNING id, name, email, role',
      [hashedPassword, normalizedEmail]
    );

    if (result.rowCount === 0) {
      console.log(`❌ Nenhum usuário encontrado com email: ${email}`);
      return false;
    }

    const user = result.rows[0];
    console.log(`✅ Senha alterada com sucesso.`);
    console.log(`   Usuário: ${user.name} (${user.email}), role: ${user.role}`);
    return true;
  } finally {
    client.release();
    await pool.end();
  }
}

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.log('Uso: node scripts/setPromoterPassword.js "email@exemplo.com" "NovaSenha"');
  process.exit(1);
}

setPromoterPassword(email, password)
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((err) => {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  });

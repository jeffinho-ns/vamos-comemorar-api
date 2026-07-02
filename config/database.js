const { Pool } = require('pg');

// Usar DATABASE_URL se disponível (produção), senão usar string hardcoded (desenvolvimento)
const connectionString = process.env.DATABASE_URL || 'postgresql://agilizaidb_user:9leBZwUgynZN5pnHPsqEJDW1tkE6LWjZ@dpg-d4bmh07diees73db68cg-a.oregon-postgres.render.com/agilizaidb?sslmode=prefer';

const pool = new Pool({
  connectionString: connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  // Render/Postgres remoto: 2s era curto demais e gerava 500 em rotas com queries paralelas.
  connectionTimeoutMillis: 15000,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  // search_path no handshake (evita corrida do handler async em pool.on('connect')).
  options:
    '-c search_path=meu_backup_db,public -c timezone=America/Sao_Paulo',
});

// Erro em cliente ocioso não deve derrubar o processo (comum após redeploy do Render).
pool.on('error', (err) => {
  console.error('Unexpected error on idle pool client:', err.message);
});

const { wrapPoolWithTenantRls } = require('../tenancy/poolRlsWrap');
wrapPoolWithTenantRls(pool);

module.exports = pool;

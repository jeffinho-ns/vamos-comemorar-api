'use strict';

const { Pool } = require('pg');
const { requireDatabaseUrl } = require('./resolveDatabaseUrl');

const connectionString = requireDatabaseUrl();
const isLocalDatabase = /localhost|127\.0\.0\.1/i.test(connectionString);

const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  ssl: !isLocalDatabase ? { rejectUnauthorized: false } : false,
  options:
    '-c search_path=meu_backup_db,public -c timezone=America/Sao_Paulo',
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle pool client:', err.message);
});

const { wrapPoolWithTenantRls } = require('../tenancy/poolRlsWrap');
wrapPoolWithTenantRls(pool);

module.exports = pool;

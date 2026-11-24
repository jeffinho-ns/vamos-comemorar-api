'use strict';

let ensurePromise = null;

function quoteIdent(name) {
  const ident = String(name || '');
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(ident)) {
    throw new Error(`identificador inválido: ${ident}`);
  }
  return ident;
}

async function dropWaOnlyUniques(pool) {
  const constraints = await pool.query(
    `SELECT con.conname
       FROM pg_constraint con
      WHERE con.conrelid = 'whatsapp_conversations'::regclass
        AND con.contype = 'u'
        AND pg_get_constraintdef(con.oid) ILIKE '%(wa_id)%'
        AND pg_get_constraintdef(con.oid) NOT ILIKE '%establishment_id%'`
  );
  for (const row of constraints.rows) {
    await pool.query(
      `ALTER TABLE whatsapp_conversations DROP CONSTRAINT IF EXISTS ${quoteIdent(row.conname)}`
    );
  }

  const indexes = await pool.query(
    `SELECT indexname
       FROM pg_indexes
      WHERE tablename = 'whatsapp_conversations'
        AND indexdef ILIKE '%UNIQUE%'
        AND indexdef ILIKE '%wa_id%'
        AND indexdef NOT ILIKE '%establishment_id%'`
  );
  for (const row of indexes.rows) {
    await pool.query(`DROP INDEX IF EXISTS ${quoteIdent(row.indexname)}`);
  }
}

async function ensureConversationHouseScope(pool) {
  if (!pool) return;
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await dropWaOnlyUniques(pool);
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_conversations_wa_est
           ON whatsapp_conversations (wa_id, establishment_id)
          WHERE establishment_id IS NOT NULL`
      );
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_conversations_wa_null_est
           ON whatsapp_conversations (wa_id)
          WHERE establishment_id IS NULL`
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_wa_updated
           ON whatsapp_conversations (wa_id, updated_at DESC)`
      );
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  return ensurePromise;
}

function toHouseId(value) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

module.exports = {
  ensureConversationHouseScope,
  toHouseId,
};

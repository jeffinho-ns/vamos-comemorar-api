const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS bi_source_snapshots (
    id BIGSERIAL PRIMARY KEY,
    establishment_id INTEGER,
    source TEXT NOT NULL,
    action TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

const CREATE_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_bi_source_snapshots_source_captured
    ON bi_source_snapshots (source, captured_at DESC)
`;

let ready = false;

async function ensureTable(pool) {
  if (ready) return;
  await pool.query(CREATE_TABLE);
  await pool.query(CREATE_INDEX);
  ready = true;
}

async function saveSnapshot(pool, { source, action, payload }) {
  await ensureTable(pool);
  const result = await pool.query(
    `INSERT INTO bi_source_snapshots (source, action, payload)
     VALUES ($1, $2, $3::jsonb)
     RETURNING id, captured_at`,
    [source, action, JSON.stringify(payload || {})],
  );
  return result.rows[0];
}

async function latestSnapshot(pool, source) {
  await ensureTable(pool);
  const result = await pool.query(
    `SELECT id, source, action, captured_at,
            octet_length(payload::text) AS bytes
       FROM bi_source_snapshots
      WHERE source = $1
      ORDER BY captured_at DESC
      LIMIT 1`,
    [source],
  );
  return result.rows[0] || null;
}

module.exports = {
  ensureTable,
  saveSnapshot,
  latestSnapshot,
};

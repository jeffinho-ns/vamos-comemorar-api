'use strict';

let ensurePromise = null;

async function ensureFlyerAssetColumns(pool) {
  if (!pool) return;
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await pool.query(
        `ALTER TABLE ai_flyers
           ADD COLUMN IF NOT EXISTS asset_kind VARCHAR(20) NOT NULL DEFAULT 'informacao'`
      );
      await pool.query(
        `ALTER TABLE ai_flyers
           ADD COLUMN IF NOT EXISTS usage_hint TEXT NOT NULL DEFAULT ''`
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_ai_flyers_kind
           ON ai_flyers (establishment_id, asset_kind, is_active)`
      );
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  return ensurePromise;
}

module.exports = { ensureFlyerAssetColumns };

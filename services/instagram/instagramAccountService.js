function normalizeIgId(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits || null;
}

function normalizeUsername(value) {
  const raw = String(value || '').trim().replace(/^@+/, '');
  return raw ? raw.slice(0, 128) : null;
}

function maskToken(token) {
  const raw = String(token || '');
  if (!raw) return null;
  if (raw.length <= 4) return '••••';
  return `••••${raw.slice(-4)}`;
}

function toPublicAccount(row) {
  if (!row) return null;
  return {
    establishment_id: Number(row.establishment_id) || null,
    ig_user_id: row.ig_user_id || null,
    page_id: row.page_id || null,
    username: row.username || null,
    is_active: row.is_active !== false,
    has_token: Boolean(String(row.access_token || '').trim()),
    token_hint: maskToken(row.access_token),
    updated_at: row.updated_at || null,
  };
}

function pickAccountFromRows(rows = [], accountIds = []) {
  const wanted = new Set((accountIds || []).map((id) => String(id)));
  if (!wanted.size) return null;
  return (
    (rows || []).find((row) => {
      if (row.is_active === false) return false;
      return wanted.has(String(row.ig_user_id || '')) || wanted.has(String(row.page_id || ''));
    }) || null
  );
}

async function getByEstablishmentId(pool, establishmentId) {
  const id = Number(establishmentId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const result = await pool.query(
    `SELECT * FROM instagram_accounts WHERE establishment_id = $1 LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
}

async function findActiveByAccountIds(pool, accountIds = []) {
  const ids = [...new Set((accountIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return null;
  const result = await pool.query(
    `SELECT * FROM instagram_accounts
      WHERE is_active = TRUE
        AND (ig_user_id = ANY($1::text[]) OR page_id = ANY($1::text[]))
      LIMIT 2`,
    [ids]
  );
  return pickAccountFromRows(result.rows, ids);
}

async function findActiveByEstablishmentId(pool, establishmentId) {
  const row = await getByEstablishmentId(pool, establishmentId);
  if (!row || row.is_active === false || !String(row.access_token || '').trim()) return null;
  return row;
}

async function findActiveByCustomerWaId(pool, waId) {
  const result = await pool.query(
    `SELECT a.*
       FROM whatsapp_conversations c
       JOIN instagram_accounts a ON a.establishment_id = c.establishment_id
      WHERE c.wa_id = $1
        AND a.is_active = TRUE
        AND COALESCE(a.access_token, '') <> ''
      LIMIT 1`,
    [String(waId || '')]
  );
  return result.rows[0] || null;
}

async function upsertAccount(pool, establishmentId, input = {}) {
  const igUserId = normalizeIgId(input.ig_user_id);
  if (!igUserId) {
    const error = new Error('Informe o ID do Instagram da casa.');
    error.statusCode = 400;
    throw error;
  }
  const pageId = normalizeIgId(input.page_id);
  const username = normalizeUsername(input.username);
  const nextToken = String(input.access_token || '').trim();
  const isActive = input.is_active !== false;

  const taken = await pool.query(
    `SELECT establishment_id FROM instagram_accounts
      WHERE ig_user_id = $1 AND establishment_id <> $2 LIMIT 1`,
    [igUserId, establishmentId]
  );
  if (taken.rows[0]) {
    const error = new Error('Esse Instagram já está ligado em outra casa.');
    error.statusCode = 409;
    throw error;
  }

  const current = await getByEstablishmentId(pool, establishmentId);
  const accessToken = nextToken || current?.access_token || '';
  if (!accessToken) {
    const error = new Error('Cole o token de acesso do Instagram desta casa.');
    error.statusCode = 400;
    throw error;
  }

  const result = await pool.query(
    `INSERT INTO instagram_accounts (
       establishment_id, ig_user_id, page_id, username, access_token, is_active, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (establishment_id) DO UPDATE SET
       ig_user_id = EXCLUDED.ig_user_id,
       page_id = EXCLUDED.page_id,
       username = EXCLUDED.username,
       access_token = EXCLUDED.access_token,
       is_active = EXCLUDED.is_active,
       updated_at = NOW()
     RETURNING *`,
    [establishmentId, igUserId, pageId, username, accessToken, isActive]
  );
  return result.rows[0];
}

async function disconnectAccount(pool, establishmentId) {
  const result = await pool.query(
    `DELETE FROM instagram_accounts WHERE establishment_id = $1 RETURNING id`,
    [establishmentId]
  );
  return Boolean(result.rows[0]);
}

module.exports = {
  normalizeIgId,
  normalizeUsername,
  maskToken,
  toPublicAccount,
  pickAccountFromRows,
  getByEstablishmentId,
  findActiveByAccountIds,
  findActiveByEstablishmentId,
  findActiveByCustomerWaId,
  upsertAccount,
  disconnectAccount,
};

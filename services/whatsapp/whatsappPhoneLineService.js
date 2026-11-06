'use strict';

const SCOPED_PREFIX = 'waba:';

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function parseScopedWaId(value) {
  const raw = String(value || '').trim();
  if (!raw.toLowerCase().startsWith(SCOPED_PREFIX)) return null;
  const rest = raw.slice(SCOPED_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep <= 0) return null;
  const phoneNumberId = digitsOnly(rest.slice(0, sep));
  const customer = digitsOnly(rest.slice(sep + 1));
  if (!phoneNumberId || customer.length < 12) return null;
  return { phoneNumberId, customer };
}

/**
 * O número já usado em produção continua com o wa_id do cliente.
 * Número novo de outra casa ganha prefixo para não misturar a conversa.
 */
function scopeCustomerWaId(customerWaId, phoneNumberId, legacyPhoneNumberId) {
  const customer = digitsOnly(customerWaId);
  const phoneId = digitsOnly(phoneNumberId);
  const legacy = digitsOnly(legacyPhoneNumberId);
  if (!customer) return null;
  if (!phoneId || (legacy && phoneId === legacy)) return customer;
  return `${SCOPED_PREFIX}${phoneId}:${customer}`;
}

function maskToken(token) {
  const raw = String(token || '');
  if (!raw) return null;
  if (raw.length <= 4) return '••••';
  return `••••${raw.slice(-4)}`;
}

function toPublicLine(row) {
  if (!row) return null;
  return {
    establishment_id: Number(row.establishment_id) || null,
    phone_number_id: row.phone_number_id || null,
    display_phone: row.display_phone || null,
    is_active: row.is_active !== false,
    has_token: Boolean(String(row.access_token || '').trim()),
    token_hint: maskToken(row.access_token),
    updated_at: row.updated_at || null,
  };
}

function toLineContext(row) {
  if (!row || row.is_active === false || !row.phone_number_id) return null;
  return {
    phoneNumberId: String(row.phone_number_id),
    accessToken: String(row.access_token || '').trim() || null,
    establishmentId: Number(row.establishment_id) || null,
  };
}

async function getByEstablishmentId(pool, establishmentId) {
  const id = Number(establishmentId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const result = await pool.query(
    `SELECT * FROM whatsapp_phone_lines WHERE establishment_id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] || null;
}

async function findActiveByPhoneNumberId(pool, phoneNumberId) {
  const id = digitsOnly(phoneNumberId);
  if (!id) return null;
  const result = await pool.query(
    `SELECT * FROM whatsapp_phone_lines
      WHERE phone_number_id = $1 AND is_active = TRUE
      LIMIT 1`,
    [id],
  );
  return result.rows[0] || null;
}

async function findActiveByEstablishmentId(pool, establishmentId) {
  const row = await getByEstablishmentId(pool, establishmentId);
  if (!row || row.is_active === false || !row.phone_number_id) return null;
  return row;
}

async function upsertLine(pool, establishmentId, input = {}) {
  const phoneNumberId = digitsOnly(input.phone_number_id);
  if (!phoneNumberId) {
    const error = new Error('Informe o ID do número na Meta (Phone number ID).');
    error.statusCode = 400;
    throw error;
  }
  const displayPhone = digitsOnly(input.display_phone).slice(0, 20) || null;
  const nextToken = String(input.access_token || '').trim();
  const isActive = input.is_active !== false;

  const taken = await pool.query(
    `SELECT establishment_id FROM whatsapp_phone_lines
      WHERE phone_number_id = $1 AND establishment_id <> $2
      LIMIT 1`,
    [phoneNumberId, establishmentId],
  );
  if (taken.rows[0]) {
    const error = new Error('Esse número da Meta já está ligado em outra casa.');
    error.statusCode = 409;
    throw error;
  }

  const current = await getByEstablishmentId(pool, establishmentId);
  const accessToken = nextToken || current?.access_token || '';

  const result = await pool.query(
    `INSERT INTO whatsapp_phone_lines (
       establishment_id, phone_number_id, display_phone, access_token, is_active, updated_at
     ) VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (establishment_id) DO UPDATE SET
       phone_number_id = EXCLUDED.phone_number_id,
       display_phone = EXCLUDED.display_phone,
       access_token = EXCLUDED.access_token,
       is_active = EXCLUDED.is_active,
       updated_at = NOW()
     RETURNING *`,
    [establishmentId, phoneNumberId, displayPhone, accessToken, isActive],
  );
  return result.rows[0];
}

async function disconnectLine(pool, establishmentId) {
  await pool.query(`DELETE FROM whatsapp_phone_lines WHERE establishment_id = $1`, [
    establishmentId,
  ]);
}

module.exports = {
  SCOPED_PREFIX,
  parseScopedWaId,
  scopeCustomerWaId,
  toPublicLine,
  toLineContext,
  getByEstablishmentId,
  findActiveByPhoneNumberId,
  findActiveByEstablishmentId,
  upsertLine,
  disconnectLine,
};

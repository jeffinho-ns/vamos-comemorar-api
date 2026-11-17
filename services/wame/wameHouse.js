'use strict';

/**
 * Casa da linha oficial conectada na Wame.
 * O id da instância Wame não é o phone_number_id numérico da Meta,
 * então a casa sai do telefone exibido no webhook.
 */
const DISPLAY_PHONE_TO_ESTABLISHMENT = {
  '551123050938': 8,
  '551152003650': 1,
};

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeDisplayPhone(value) {
  const digits = digitsOnly(value);
  if (!digits) return '';
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
    return `55${digits}`;
  }
  return digits;
}

function establishmentFromDisplayPhone(displayPhone) {
  const normalized = normalizeDisplayPhone(displayPhone);
  const id = DISPLAY_PHONE_TO_ESTABLISHMENT[normalized];
  return Number.isFinite(id) && id > 0 ? id : null;
}

function displayPhoneFromPayload(payload) {
  const change = payload?.entry?.[0]?.changes?.[0];
  return change?.value?.metadata?.display_phone_number || null;
}

async function findEstablishmentByDisplayPhone(pool, displayPhone) {
  const normalized = normalizeDisplayPhone(displayPhone);
  if (!pool || !normalized) return null;
  const result = await pool.query(
    `SELECT establishment_id
       FROM whatsapp_phone_lines
      WHERE is_active = TRUE
        AND (
          regexp_replace(COALESCE(display_phone, ''), '\\D', '', 'g') IN ($1, $2)
          OR regexp_replace(COALESCE(phone_number_id, ''), '\\D', '', 'g') IN ($1, $2)
        )
      LIMIT 1`,
    [normalized, normalized.replace(/^55/, '')],
  );
  const id = Number(result.rows[0]?.establishment_id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function resolveWameEstablishmentId(pool, payload) {
  const displayPhone = displayPhoneFromPayload(payload);
  const mapped = establishmentFromDisplayPhone(displayPhone);
  if (mapped) return mapped;

  try {
    const fromLine = await findEstablishmentByDisplayPhone(pool, displayPhone);
    if (fromLine) return fromLine;
  } catch (error) {
    console.warn('[Wame] lookup da linha falhou:', error.message);
  }

  const envDefault = Number(process.env.WAME_DEFAULT_ESTABLISHMENT_ID);
  return Number.isFinite(envDefault) && envDefault > 0 ? envDefault : null;
}

module.exports = {
  DISPLAY_PHONE_TO_ESTABLISHMENT,
  normalizeDisplayPhone,
  establishmentFromDisplayPhone,
  displayPhoneFromPayload,
  resolveWameEstablishmentId,
};

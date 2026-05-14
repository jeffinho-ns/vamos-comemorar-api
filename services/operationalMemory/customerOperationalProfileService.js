function buildProfileSummary(profile) {
  if (!profile) return '';
  if (profile.profile_summary) return String(profile.profile_summary).trim();

  const chunks = [];
  if (profile.reservation_count_12m > 0) {
    chunks.push(`fez ${profile.reservation_count_12m} reserva(s) nos últimos 12 meses`);
  }
  if (profile.favorite_establishment_name) {
    chunks.push(`costuma ir em ${profile.favorite_establishment_name}`);
  }
  if (profile.avg_party_size) {
    chunks.push(`média de ${Number(profile.avg_party_size)} pessoas`);
  }
  if (profile.no_show_count_12m > 0) {
    chunks.push(`${profile.no_show_count_12m} no-show(s) recente(s)`);
  }
  if (profile.avg_ticket_estimate) {
    chunks.push(`ticket médio estimado R$ ${Number(profile.avg_ticket_estimate).toFixed(0)}`);
  }
  return chunks.join('; ');
}

async function refreshProfileFromSources(pool, waId) {
  const normalizedWaId = String(waId || '').trim();
  if (!normalizedWaId) return null;

  const normalizedPhone = normalizedWaId.replace(/\D/g, '');

  const stats = await pool.query(
    `SELECT
       COUNT(*)::int AS reservation_count_12m,
       COUNT(*) FILTER (
         WHERE LOWER(COALESCE(status, '')) IN ('no_show', 'no-show')
       )::int AS no_show_count_12m,
       AVG(NULLIF(number_of_people, 0)) AS avg_party_size,
       MAX(created_at) AS last_reservation_at,
       MAX(created_at) FILTER (
         WHERE LOWER(COALESCE(status, '')) IN ('no_show', 'no-show')
       ) AS last_no_show_at,
       MODE() WITHIN GROUP (ORDER BY establishment_id) AS favorite_establishment_id
     FROM restaurant_reservations
     WHERE regexp_replace(COALESCE(client_phone, ''), '[^0-9]', '', 'g') = $1
       AND created_at >= NOW() - interval '12 months'`,
    [normalizedPhone]
  );

  const contact = await pool.query(
    `SELECT client_email, last_establishment_id
       FROM whatsapp_contacts
      WHERE wa_id = $1
      LIMIT 1`,
    [normalizedWaId]
  );

  const row = stats.rows[0] || {};
  const contactRow = contact.rows[0] || {};
  const favoriteEstablishmentId =
    row.favorite_establishment_id || contactRow.last_establishment_id || null;

  const result = await pool.query(
    `INSERT INTO customer_operational_profile (
       wa_id, client_email, favorite_establishment_id, avg_party_size,
       reservation_count_12m, no_show_count_12m, last_reservation_at, last_no_show_at,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (wa_id) DO UPDATE SET
       client_email = COALESCE(EXCLUDED.client_email, customer_operational_profile.client_email),
       favorite_establishment_id = COALESCE(EXCLUDED.favorite_establishment_id, customer_operational_profile.favorite_establishment_id),
       avg_party_size = COALESCE(EXCLUDED.avg_party_size, customer_operational_profile.avg_party_size),
       reservation_count_12m = EXCLUDED.reservation_count_12m,
       no_show_count_12m = EXCLUDED.no_show_count_12m,
       last_reservation_at = EXCLUDED.last_reservation_at,
       last_no_show_at = EXCLUDED.last_no_show_at,
       updated_at = NOW()
     RETURNING *`,
    [
      normalizedWaId,
      contactRow.client_email || null,
      favoriteEstablishmentId,
      row.avg_party_size || null,
      row.reservation_count_12m || 0,
      row.no_show_count_12m || 0,
      row.last_reservation_at || null,
      row.last_no_show_at || null,
    ]
  );

  const profile = result.rows[0];
  const summary = buildProfileSummary(profile);
  if (summary) {
    await pool.query(
      `UPDATE customer_operational_profile
          SET profile_summary = $2, updated_at = NOW()
        WHERE wa_id = $1`,
      [normalizedWaId, summary]
    );
    profile.profile_summary = summary;
  }
  return profile;
}

async function getProfileForPrompt(pool, waId) {
  const normalizedWaId = String(waId || '').trim();
  if (!normalizedWaId) return { profile: null, summary: '' };

  try {
    const existing = await pool.query(
      `SELECT p.*, pl.name AS favorite_establishment_name
         FROM customer_operational_profile p
         LEFT JOIN places pl ON pl.id = p.favorite_establishment_id
        WHERE p.wa_id = $1
        LIMIT 1`,
      [normalizedWaId]
    );
    if (existing.rows[0]) {
      const profile = existing.rows[0];
      return {
        profile,
        summary: buildProfileSummary(profile),
      };
    }
    const refreshed = await refreshProfileFromSources(pool, normalizedWaId);
    return {
      profile: refreshed,
      summary: buildProfileSummary(refreshed),
    };
  } catch (error) {
    console.warn('[operationalMemory] perfil indisponível:', error.message);
    return { profile: null, summary: '' };
  }
}

module.exports = {
  buildProfileSummary,
  refreshProfileFromSources,
  getProfileForPrompt,
};

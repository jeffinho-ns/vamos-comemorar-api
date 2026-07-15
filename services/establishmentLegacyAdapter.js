'use strict';

/**
 * Leitura de places/bars a partir de `establishments` (migration 006).
 * Writes continuam nas tabelas legadas; só GET usa esta camada quando
 * ESTABLISHMENTS_READ_SOURCE=establishments.
 */

function establishmentsReadSource() {
  return String(process.env.ESTABLISHMENTS_READ_SOURCE || 'legacy').toLowerCase();
}

function shouldReadFromEstablishments() {
  return establishmentsReadSource() === 'establishments';
}

// NULL = sem configuração de módulos (tudo liberado); array = só o que está habilitado.
const ENABLED_MODULES_SQL = `
  (
    SELECT CASE WHEN COUNT(*) = 0 THEN NULL
                ELSE COALESCE(json_agg(m.key) FILTER (WHERE em.is_enabled = TRUE), '[]'::json) END
      FROM establishment_modules em
      JOIN modules m ON m.id = em.module_id AND m.is_active = TRUE
     WHERE em.establishment_id = e.id
  ) AS enabled_modules
`;

const PLACES_FROM_ESTABLISHMENTS_SQL = `
  SELECT
    e.legacy_place_id AS id,
    COALESCE(p.slug, e.slug) AS slug,
    e.name,
    e.email,
    e.description,
    e.logo,
    e.street,
    e.number,
    e.latitude,
    e.longitude,
    COALESCE(p.status::text, e.status, 'active') AS status,
    COALESCE(e.visible, p.visible, TRUE) AS visible,
    e.organization_id AS organization_id,
    ${ENABLED_MODULES_SQL}
  FROM establishments e
  LEFT JOIN places p ON p.id = e.legacy_place_id
  WHERE e.legacy_place_id IS NOT NULL
    AND COALESCE(e.status, 'active') <> 'archived'
  ORDER BY e.legacy_place_id
`;

const PLACE_BY_LEGACY_ID_SQL = `
  SELECT
    e.legacy_place_id AS id,
    COALESCE(p.slug, e.slug) AS slug,
    e.name,
    e.email,
    e.description,
    e.logo,
    e.street,
    e.number,
    e.latitude,
    e.longitude,
    COALESCE(p.status::text, e.status, 'active') AS status,
    COALESCE(e.visible, p.visible, TRUE) AS visible,
    e.organization_id AS organization_id
  FROM establishments e
  LEFT JOIN places p ON p.id = e.legacy_place_id
  WHERE e.legacy_place_id = $1
  LIMIT 1
`;

const BARS_FROM_ESTABLISHMENTS_SQL = `
  SELECT
    e.legacy_bar_id AS id,
    COALESCE(b.slug, e.slug) AS slug,
    COALESCE(b.name, e.name) AS name,
    e.description,
    e.logo_url AS logourl,
    e.cover_image_url AS coverimageurl,
    e.cover_images AS coverimages,
    e.address,
    e.rating,
    e.reviews_count AS reviewscount,
    e.latitude,
    e.longitude,
    e.amenities,
    e.popup_image_url AS popupimageurl,
    e.facebook,
    e.instagram,
    e.whatsapp,
    e.partner_logos,
    COALESCE(e.theme->>'menu_category_text_color', b.menu_category_text_color) AS menu_category_text_color,
    COALESCE(e.theme->>'menu_subcategory_text_color', b.menu_subcategory_text_color) AS menu_subcategory_text_color,
    COALESCE(e.theme->>'mobile_sidebar_text_color', b.mobile_sidebar_text_color) AS mobile_sidebar_text_color,
    COALESCE(e.theme->>'menu_category_bg_color', b.menu_category_bg_color) AS menu_category_bg_color,
    COALESCE(e.theme->>'menu_subcategory_bg_color', b.menu_subcategory_bg_color) AS menu_subcategory_bg_color,
    COALESCE(e.theme->>'mobile_sidebar_bg_color', b.mobile_sidebar_bg_color) AS mobile_sidebar_bg_color,
    COALESCE(e.theme->'custom_seals', b.custom_seals::jsonb) AS custom_seals,
    ${ENABLED_MODULES_SQL}
  FROM establishments e
  LEFT JOIN bars b ON b.id = e.legacy_bar_id
  WHERE e.legacy_bar_id IS NOT NULL
    AND COALESCE(e.status, 'active') <> 'archived'
  ORDER BY e.legacy_bar_id
`;

const BAR_BY_LEGACY_ID_SQL = `
  SELECT
    e.legacy_bar_id AS id,
    COALESCE(b.slug, e.slug) AS slug,
    COALESCE(b.name, e.name) AS name,
    e.description,
    e.logo_url AS logourl,
    e.cover_image_url AS coverimageurl,
    e.cover_images AS coverimages,
    e.address,
    e.rating,
    e.reviews_count AS reviewscount,
    e.latitude,
    e.longitude,
    e.amenities,
    e.popup_image_url AS popupimageurl,
    e.facebook,
    e.instagram,
    e.whatsapp,
    e.partner_logos,
    COALESCE(e.theme->>'menu_category_text_color', b.menu_category_text_color) AS menu_category_text_color,
    COALESCE(e.theme->>'menu_subcategory_text_color', b.menu_subcategory_text_color) AS menu_subcategory_text_color,
    COALESCE(e.theme->>'mobile_sidebar_text_color', b.mobile_sidebar_text_color) AS mobile_sidebar_text_color,
    COALESCE(e.theme->>'menu_category_bg_color', b.menu_category_bg_color) AS menu_category_bg_color,
    COALESCE(e.theme->>'menu_subcategory_bg_color', b.menu_subcategory_bg_color) AS menu_subcategory_bg_color,
    COALESCE(e.theme->>'mobile_sidebar_bg_color', b.mobile_sidebar_bg_color) AS mobile_sidebar_bg_color,
    COALESCE(e.theme->'custom_seals', b.custom_seals::jsonb) AS custom_seals
  FROM establishments e
  LEFT JOIN bars b ON b.id = e.legacy_bar_id
  WHERE e.legacy_bar_id = $1
  LIMIT 1
`;

async function listPlacesFromEstablishments(client) {
  const result = await client.query(PLACES_FROM_ESTABLISHMENTS_SQL);
  return result.rows;
}

async function getPlaceFromEstablishments(client, placeId) {
  const result = await client.query(PLACE_BY_LEGACY_ID_SQL, [placeId]);
  return result.rows[0] || null;
}

async function listBarsFromEstablishments(pool) {
  const result = await pool.query(BARS_FROM_ESTABLISHMENTS_SQL);
  return result.rows;
}

async function getBarFromEstablishments(pool, barId) {
  const result = await pool.query(BAR_BY_LEGACY_ID_SQL, [barId]);
  return result.rows[0] || null;
}

module.exports = {
  establishmentsReadSource,
  shouldReadFromEstablishments,
  listPlacesFromEstablishments,
  getPlaceFromEstablishments,
  listBarsFromEstablishments,
  getBarFromEstablishments,
};

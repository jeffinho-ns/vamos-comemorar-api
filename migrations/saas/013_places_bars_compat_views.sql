-- ============================================================================
-- SaaS Multi-Tenant — 013: views de compatibilidade places/bars
-- ----------------------------------------------------------------------------
-- Views SOMENTE LEITURA para validar paridade establishments ↔ legado.
-- Não substituem as tabelas places/bars; API continua escrevendo no legado
-- até fase Contract. Rodar via scripts/saas/run-saas-migrations.js.
-- ============================================================================

SET search_path TO meu_backup_db, public;

CREATE OR REPLACE VIEW places_compat AS
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
  COALESCE(p.status, e.status, 'active') AS status,
  COALESCE(e.visible, p.visible, TRUE) AS visible
FROM establishments e
LEFT JOIN places p ON p.id = e.legacy_place_id
WHERE e.legacy_place_id IS NOT NULL;

CREATE OR REPLACE VIEW bars_compat AS
SELECT
  e.legacy_bar_id AS id,
  COALESCE(b.slug, e.slug) AS slug,
  e.name,
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
  COALESCE(e.theme->'custom_seals', b.custom_seals) AS custom_seals
FROM establishments e
LEFT JOIN bars b ON b.id = e.legacy_bar_id
WHERE e.legacy_bar_id IS NOT NULL;

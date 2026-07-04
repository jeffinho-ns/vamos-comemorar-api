-- Corrige bars_compat: nome operacional vem de bars (paridade com GET /api/bars legacy)
SET search_path TO meu_backup_db, public;

CREATE OR REPLACE VIEW bars_compat AS
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
WHERE e.legacy_bar_id IS NOT NULL;

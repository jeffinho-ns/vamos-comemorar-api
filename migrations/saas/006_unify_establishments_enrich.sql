-- ============================================================================
-- SaaS Multi-Tenant — Unificação places+bars / 006: enriquecer establishments
-- ----------------------------------------------------------------------------
-- Torna `establishments` a fonte ÚNICA da "casa": copia os campos de identidade
-- operacional (places) e de vitrine/cardápio (bars) para colunas tipadas, e as
-- cores/selos do menu para um JSONB `theme`. Mantém places/bars intactos
-- (compatibilidade): nada legado é alterado. 100% ADITIVO e idempotente.
--
-- ⚠️ Rodar via scripts/saas/run-saas-migrations.js (staging antes de prod).
-- ============================================================================

SET search_path TO meu_backup_db, public;

-- 1) Colunas tipadas principais (decisão: tipado + JSONB theme p/ o tema)
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS visible         BOOLEAN;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS email           VARCHAR(255);
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS description     TEXT;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS logo            VARCHAR(500); -- places.logo (operacional)
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS logo_url        VARCHAR(500); -- bars.logourl (vitrine)
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS street          VARCHAR(255);
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS number          BIGINT;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS address         VARCHAR(255); -- bars.address
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS latitude        NUMERIC;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS longitude       NUMERIC;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS cover_image_url VARCHAR(500);
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS cover_images    TEXT;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS popup_image_url VARCHAR(500);
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS amenities       TEXT;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS rating          NUMERIC;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS reviews_count   BIGINT;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS facebook        VARCHAR(255);
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS instagram       VARCHAR(255);
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS whatsapp        VARCHAR(255);
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS partner_logos   JSONB;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS theme           JSONB;

-- 2) Backfill a partir de places (identidade operacional)
UPDATE establishments e
   SET visible     = COALESCE(e.visible, p.visible),
       email       = COALESCE(e.email, p.email),
       description = COALESCE(e.description, p.description),
       logo        = COALESCE(e.logo, p.logo),
       street      = COALESCE(e.street, p.street),
       number      = COALESCE(e.number, p.number),
       latitude    = COALESCE(e.latitude, p.latitude),
       longitude   = COALESCE(e.longitude, p.longitude)
  FROM places p
 WHERE e.legacy_place_id = p.id;

-- 3) Backfill a partir de bars (vitrine + cardápio + tema)
UPDATE establishments e
   SET logo_url        = COALESCE(e.logo_url, b.logourl),
       cover_image_url = COALESCE(e.cover_image_url, b.coverimageurl),
       cover_images    = COALESCE(e.cover_images, b.coverimages),
       popup_image_url = COALESCE(e.popup_image_url, b.popupimageurl),
       address         = COALESCE(e.address, b.address),
       amenities       = COALESCE(e.amenities, b.amenities),
       rating          = COALESCE(e.rating, b.rating),
       reviews_count   = COALESCE(e.reviews_count, b.reviewscount),
       facebook        = COALESCE(e.facebook, b.facebook),
       instagram       = COALESCE(e.instagram, b.instagram),
       whatsapp        = COALESCE(e.whatsapp, b.whatsapp),
       partner_logos   = COALESCE(e.partner_logos, b.partner_logos),
       description     = COALESCE(e.description, b.description),
       latitude        = COALESCE(e.latitude, b.latitude),
       longitude       = COALESCE(e.longitude, b.longitude),
       theme           = COALESCE(e.theme, jsonb_strip_nulls(jsonb_build_object(
                            'menu_category_text_color',    b.menu_category_text_color,
                            'menu_subcategory_text_color', b.menu_subcategory_text_color,
                            'mobile_sidebar_text_color',   b.mobile_sidebar_text_color,
                            'menu_category_bg_color',      b.menu_category_bg_color,
                            'menu_subcategory_bg_color',   b.menu_subcategory_bg_color,
                            'mobile_sidebar_bg_color',     b.mobile_sidebar_bg_color,
                            'custom_seals',                b.custom_seals
                          )))
  FROM bars b
 WHERE e.legacy_bar_id = b.id;

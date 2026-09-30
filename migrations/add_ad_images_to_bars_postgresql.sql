-- Artes de propaganda vendidas pelo estabelecimento (carrossel no cardápio público).
ALTER TABLE bars
  ADD COLUMN IF NOT EXISTS ad_images JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN bars.ad_images IS 'Array JSON com URLs/filenames das artes de propaganda do cardápio público';

DO $$
BEGIN
  IF to_regclass('establishments') IS NOT NULL THEN
    ALTER TABLE establishments
      ADD COLUMN IF NOT EXISTS ad_images JSONB NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

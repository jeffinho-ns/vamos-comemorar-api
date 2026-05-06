-- Logos de marcas parceiras por estabelecimento (cardápio público), até 5 URLs armazenadas como JSON array
ALTER TABLE bars
  ADD COLUMN IF NOT EXISTS partner_logos JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN bars.partner_logos IS 'Array JSON com até 5 URLs/filenames de logos de parceiros para /cardapio/[slug]';

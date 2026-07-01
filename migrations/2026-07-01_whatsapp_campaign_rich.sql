-- Campanhas WhatsApp estilo "email marketing": título, imagem e corpo.
-- Idempotente (IF NOT EXISTS).

ALTER TABLE whatsapp_campaigns
  ADD COLUMN IF NOT EXISTS headline TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS send_mode VARCHAR(20) NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS meta_template_name VARCHAR(120),
  ADD COLUMN IF NOT EXISTS meta_template_language VARCHAR(10) NOT NULL DEFAULT 'pt_BR';

COMMENT ON COLUMN whatsapp_campaigns.headline IS 'Título da campanha (assunto / cabeçalho visual)';
COMMENT ON COLUMN whatsapp_campaigns.image_url IS 'URL pública da imagem hero (Cloudinary)';
COMMENT ON COLUMN whatsapp_campaigns.send_mode IS 'auto | session | template — ver campaignDeliveryService';
COMMENT ON COLUMN whatsapp_campaigns.meta_template_name IS 'Nome do template aprovado na Meta (marketing com imagem)';
COMMENT ON COLUMN whatsapp_campaigns.meta_template_language IS 'Código de idioma do template Meta (ex.: pt_BR)';

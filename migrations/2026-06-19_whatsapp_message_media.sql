-- Suporte a mensagens de mídia (imagem) na Central WhatsApp.
-- Mantém compatibilidade: mensagens de texto continuam usando message_type='text'.

ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) NOT NULL DEFAULT 'text';

ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS media_url TEXT;

ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS media_mime VARCHAR(120);

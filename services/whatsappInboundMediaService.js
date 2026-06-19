/**
 * Captura de mídia (imagem) recebida no WhatsApp.
 * Baixa o binário da Graph API, hospeda no Cloudinary (pasta whatsapp-inbound)
 * e persiste como mensagem inbound para aparecer no box da conversa.
 * As mídias de conversa são expurgadas após 24h por um worker (economia de espaço).
 */
const inbox = require('./whatsappInboxRepository');
const cloudinaryService = require('./cloudinaryService');
const { downloadMedia } = require('./whatsappService');

function emitInbox(app, payload) {
  const io = app?.get?.('socketio');
  if (io) {
    io.to('whatsapp_inbox').emit('whatsapp_inbox_update', {
      type: payload?.type || 'refresh',
      wa_id: payload?.wa_id || null,
    });
  }
}

function extractContactName(payload) {
  return payload?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name || null;
}

/**
 * Lê o objeto de mídia da mensagem recebida. Hoje cobre imagem; outros tipos
 * podem ser adicionados depois (sticker/audio/document).
 */
function extractInboundMedia(payload) {
  const firstMessage = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!firstMessage) return null;
  const img = firstMessage.image;
  if (img?.id) {
    return {
      kind: 'image',
      mediaId: String(img.id),
      mimeType: img.mime_type || 'image/jpeg',
      caption: typeof img.caption === 'string' ? img.caption : '',
    };
  }
  return null;
}

async function handleInboundMedia(pool, app, { waId, payload, media }) {
  if (!waId || !media?.mediaId) return null;

  const contactName = extractContactName(payload);
  const conversation = await inbox.upsertConversation(pool, { waId, contactName });

  const { buffer, mimeType } = await downloadMedia(media.mediaId);
  const ext = ((mimeType || media.mimeType || 'image/jpeg').split('/')[1] || 'jpg').split(';')[0];
  const fileName = `wpp_in_${waId}_${Date.now()}.${ext}`;

  const uploaded = await cloudinaryService.uploadFile(fileName, buffer, {
    folder: 'whatsapp-inbound',
  });

  const saved = await inbox.insertMessage(pool, {
    conversationId: conversation.id,
    direction: 'inbound',
    body: media.caption || '',
    messageType: 'image',
    mediaUrl: uploaded.secureUrl,
    mediaMime: mimeType || media.mimeType || null,
    mediaPublicId: uploaded.publicId || null,
    rawPayload: payload,
  });

  try {
    await inbox.upsertContact(pool, { waId, contactName });
  } catch (e) {
    console.warn('[inboundMedia] upsertContact falhou:', e.message);
  }

  emitInbox(app, { type: 'inbound', wa_id: waId });
  return saved;
}

module.exports = {
  extractInboundMedia,
  handleInboundMedia,
};

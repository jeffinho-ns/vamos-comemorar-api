const { sendMessage } = require('../whatsappService');
const { enqueueWhatsAppOutbound, enqueueWhatsAppTemplate } = require('../../infrastructure/queue/producers');
const { isQueueEnabled } = require('../../infrastructure/queue/redisConnection');

async function sendText(to, text, meta = {}) {
  if (!to || !text) return { delivered: false, reason: 'invalid_payload' };

  if (isQueueEnabled() && process.env.BULLMQ_WHATSAPP_INLINE !== 'true') {
    const result = await enqueueWhatsAppOutbound({
      to,
      text,
      meta,
    });
    if (result.enqueued) {
      return { delivered: true, mode: 'queued', jobId: result.jobId };
    }
  }

  const response = await sendMessage(to, text);
  return { delivered: true, mode: 'inline', response };
}

async function sendTemplate(to, template, meta = {}) {
  if (!to || !template) return { delivered: false, reason: 'invalid_payload' };

  if (isQueueEnabled() && process.env.BULLMQ_WHATSAPP_INLINE !== 'true') {
    const result = await enqueueWhatsAppTemplate({
      to,
      template,
      meta,
    });
    if (result.enqueued) {
      return { delivered: true, mode: 'queued', jobId: result.jobId };
    }
  }

  const { sendTemplateMessage } = require('../whatsappService');
  const response = await sendTemplateMessage(to, template);
  return { delivered: true, mode: 'inline', response };
}

async function sendSticker(to, sticker = {}) {
  if (!to || (!sticker.mediaId && !sticker.link)) {
    return { delivered: false, reason: 'invalid_payload' };
  }
  const { sendSticker: sendStickerMessage } = require('../whatsappService');
  const response = await sendStickerMessage(to, sticker);
  return { delivered: true, mode: 'inline', response };
}

async function sendImage(to, image = {}) {
  if (!to || (!image.mediaId && !image.link)) {
    return { delivered: false, reason: 'invalid_payload' };
  }
  const { sendImage: sendImageMessage } = require('../whatsappService');
  const response = await sendImageMessage(to, image);
  return { delivered: true, mode: 'inline', response };
}

module.exports = {
  sendText,
  sendTemplate,
  sendSticker,
  sendImage,
};

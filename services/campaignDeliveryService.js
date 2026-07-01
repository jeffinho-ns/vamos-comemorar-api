'use strict';

/**
 * Entrega de campanhas WhatsApp estilo "email marketing" (título + imagem + texto).
 *
 * Modos (campaign.send_mode):
 *   - session  : imagem + texto livre (só funciona na janela de 24h após inbound do cliente).
 *   - template : template Meta aprovado (marketing fora da janela / bases importadas).
 *   - auto     : session se estiver na janela; senão template (se meta_template_name configurado).
 *
 * Template Meta esperado (criar no WhatsApp Manager):
 *   Nome: WHATSAPP_CAMPAIGN_TEMPLATE_NAME (default agilizai_campanha_marketing)
 *   Categoria: MARKETING
 *   Header: IMAGE (dinâmico)
 *   Body: {{1}}  (título)  newline  {{2}}  (texto principal)
 *   Idioma: pt_BR
 */

const { sendMessage, sendImage, sendTemplateMessage } = require('./whatsappService');

const SESSION_WINDOW_HOURS = 24;

function defaultTemplateName() {
  return String(process.env.WHATSAPP_CAMPAIGN_TEMPLATE_NAME || 'agilizai_campanha_marketing').trim();
}

function defaultTemplateLanguage() {
  return String(process.env.WHATSAPP_CAMPAIGN_TEMPLATE_LANGUAGE || 'pt_BR').trim();
}

function campaignBodyText(campaign) {
  return String(campaign?.message_template || '').trim();
}

function campaignHeadline(campaign) {
  return String(campaign?.headline || campaign?.name || '').trim();
}

function campaignImageUrl(campaign) {
  const url = String(campaign?.image_url || '').trim();
  return url.startsWith('http') ? url : null;
}

function resolveSendMode(campaign) {
  const mode = String(campaign?.send_mode || 'auto').toLowerCase();
  if (mode === 'session' || mode === 'template') return mode;
  return 'auto';
}

function resolveTemplateName(campaign) {
  const fromCampaign = String(campaign?.meta_template_name || '').trim();
  return fromCampaign || defaultTemplateName();
}

function resolveTemplateLanguage(campaign) {
  return String(campaign?.meta_template_language || defaultTemplateLanguage()).trim() || 'pt_BR';
}

/** Legenda curta para imagem em modo session (limite Meta ~1024). */
function buildImageCaption(campaign) {
  const headline = campaignHeadline(campaign);
  const body = campaignBodyText(campaign);
  if (headline && body) return `${headline}\n\n${body}`.slice(0, 1024);
  return (headline || body).slice(0, 1024);
}

async function isWithinSessionWindow(pool, waId) {
  if (!pool || !waId) return false;
  const r = await pool.query(
    `SELECT 1
       FROM whatsapp_conversations cv
       JOIN whatsapp_messages m ON m.conversation_id = cv.id
      WHERE cv.wa_id = $1
        AND m.direction = 'inbound'
        AND m.created_at > NOW() - INTERVAL '${SESSION_WINDOW_HOURS} hours'
      LIMIT 1`,
    [waId]
  );
  return r.rows.length > 0;
}

function buildMetaTemplatePayload(campaign) {
  const templateName = resolveTemplateName(campaign);
  const language = resolveTemplateLanguage(campaign);
  const headline = campaignHeadline(campaign) || ' ';
  const body = campaignBodyText(campaign) || ' ';
  const imageUrl = campaignImageUrl(campaign);

  const components = [];

  if (imageUrl) {
    components.push({
      type: 'header',
      parameters: [{ type: 'image', image: { link: imageUrl } }],
    });
  }

  components.push({
    type: 'body',
    parameters: [
      { type: 'text', text: headline.slice(0, 1024) },
      { type: 'text', text: body.slice(0, 1024) },
    ],
  });

  return {
    name: templateName,
    language: { code: language },
    components,
  };
}

/**
 * Envia campanha rica para um contato.
 * @returns {{ mode: 'session'|'template', results: object[] }}
 */
async function deliverCampaignToContact(pool, campaign, contact) {
  const waId = String(contact?.wa_id || '').trim();
  if (!waId) throw new Error('Contato sem wa_id');

  const body = campaignBodyText(campaign);
  const imageUrl = campaignImageUrl(campaign);
  const headline = campaignHeadline(campaign);

  if (!body && !imageUrl) {
    throw new Error('Campanha sem texto nem imagem');
  }

  const configuredMode = resolveSendMode(campaign);
  let mode = configuredMode;

  if (mode === 'auto') {
    const inWindow = await isWithinSessionWindow(pool, waId);
    if (inWindow) {
      mode = 'session';
    } else if (resolveTemplateName(campaign)) {
      mode = 'template';
    } else {
      throw new Error(
        'Contato fora da janela de 24h. Configure um template Meta (send_mode=template ou auto com meta_template_name).'
      );
    }
  }

  const results = [];

  if (mode === 'session') {
    if (imageUrl) {
      const caption = buildImageCaption(campaign);
      const imgResult = await sendImage(waId, {
        link: imageUrl,
        caption: caption || undefined,
      });
      results.push({ type: 'image', response: imgResult });

      // Corpo longo: se caption truncou ou só título na imagem, manda texto separado quando couber.
      const fullText = [headline, body].filter(Boolean).join('\n\n');
      if (fullText.length > 1024 && body) {
        const textResult = await sendMessage(waId, body);
        results.push({ type: 'text', response: textResult });
      }
    } else if (body) {
      const text = headline ? `${headline}\n\n${body}` : body;
      const textResult = await sendMessage(waId, text);
      results.push({ type: 'text', response: textResult });
    }
    return { mode: 'session', results };
  }

  if (mode === 'template') {
    const template = buildMetaTemplatePayload(campaign);
    const tplResult = await sendTemplateMessage(waId, template);
    results.push({ type: 'template', response: tplResult, template_name: template.name });
    return { mode: 'template', results };
  }

  throw new Error(`send_mode inválido: ${configuredMode}`);
}

/** Texto armazenado no histórico da conversa (preview no inbox). */
function campaignPreviewText(campaign) {
  const headline = campaignHeadline(campaign);
  const body = campaignBodyText(campaign);
  const imageUrl = campaignImageUrl(campaign);
  const parts = [];
  if (headline) parts.push(`[${headline}]`);
  if (imageUrl) parts.push('[imagem]');
  if (body) parts.push(body);
  return parts.join('\n') || '(campanha vazia)';
}

module.exports = {
  SESSION_WINDOW_HOURS,
  deliverCampaignToContact,
  isWithinSessionWindow,
  campaignPreviewText,
  buildMetaTemplatePayload,
  defaultTemplateName,
  defaultTemplateLanguage,
};

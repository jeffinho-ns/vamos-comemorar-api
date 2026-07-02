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

/**
 * Parâmetros {{1}}/{{2}} do template Meta não podem ter quebra de linha, tab
 * nem mais de 4 espaços seguidos (erro #132018).
 */
function sanitizeTemplateParameterText(value) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {5,}/g, '    ')
    .replace(/\s+/g, ' ')
    .trim();
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

/**
 * Define session vs template. Bases importadas / sem conversa recente exigem template Meta.
 * @returns {Promise<'session'|'template'>}
 */
async function resolveEffectiveDeliveryMode(pool, campaign, waId) {
  const configuredMode = resolveSendMode(campaign);
  const templateName = resolveTemplateName(campaign);
  const inWindow = await isWithinSessionWindow(pool, waId);

  if (configuredMode === 'template') {
    if (!templateName) {
      throw new Error(
        'Campanha em modo template, mas meta_template_name não está configurado.'
      );
    }
    return 'template';
  }

  if (configuredMode === 'session') {
    if (inWindow) return 'session';
    if (templateName) return 'template';
    throw new Error(
      'Contato fora da janela de 24h (sem mensagem recente do cliente). ' +
        'Para marketing em massa, use modo Automático ou Template Meta com template aprovado na Meta.'
    );
  }

  // auto
  if (inWindow) return 'session';
  if (templateName) return 'template';
  throw new Error(
    'Contato fora da janela de 24h. Configure um template Meta aprovado ' +
      `(ex.: ${defaultTemplateName()}) e use send_mode=auto ou template.`
  );
}

/** Mensagem amigável a partir de erros da Graph API (Meta). */
function formatCampaignDeliveryError(error) {
  const responseBody = error?.responseBody;
  const metaError = responseBody?.error;
  const code = Number(metaError?.code);
  const detail = String(metaError?.message || error?.message || 'Erro ao enviar campanha').trim();

  if (code === 132001) {
    return `Template Meta não encontrado ou não aprovado. Verifique o nome "${defaultTemplateName()}" no WhatsApp Manager. Detalhe: ${detail}`;
  }
  if (code === 132000) {
    return `Template Meta com parâmetros incompatíveis (título/corpo/imagem). Confira se o template tem header IMAGE + body {{1}} e {{2}}. Detalhe: ${detail}`;
  }
  if (code === 132018) {
    return (
      'Texto da campanha inválido para template Meta: remova quebras de linha no título e no corpo ' +
      '(use um parágrafo contínuo; a formatação visual fica no template). Detalhe: ' +
      detail
    );
  }
  if (code === 131047 || code === 131026) {
    return (
      'A Meta bloqueou o envio: contato fora da janela de 24h ou número inválido. ' +
      'Use modo Template Meta para bases importadas. Detalhe: ' +
      detail
    );
  }
  if (code === 133010) {
    return `Número não autorizado no ambiente de testes da Meta. Detalhe: ${detail}`;
  }
  if (detail.includes('Falha ao enviar template')) {
    return `Falha no template Meta: ${detail}`;
  }
  if (detail.includes('Falha ao enviar imagem') || detail.includes('Falha ao enviar mensagem')) {
    return `Falha no envio livre (janela 24h): ${detail}`;
  }
  return detail;
}

function buildMetaTemplatePayload(campaign) {
  const templateName = resolveTemplateName(campaign);
  const language = resolveTemplateLanguage(campaign);
  const headline = sanitizeTemplateParameterText(campaignHeadline(campaign)) || ' ';
  const body = sanitizeTemplateParameterText(campaignBodyText(campaign)) || ' ';
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

  const mode = await resolveEffectiveDeliveryMode(pool, campaign, waId);

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

  throw new Error(`Modo de envio inválido: ${resolveSendMode(campaign)}`);
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
  resolveEffectiveDeliveryMode,
  formatCampaignDeliveryError,
  isWithinSessionWindow,
  campaignPreviewText,
  buildMetaTemplatePayload,
  sanitizeTemplateParameterText,
  defaultTemplateName,
  defaultTemplateLanguage,
};

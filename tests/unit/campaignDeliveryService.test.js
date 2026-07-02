'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildMetaTemplatePayload,
  campaignPreviewText,
  defaultTemplateName,
  formatCampaignDeliveryError,
  resolveEffectiveDeliveryMode,
} = require('../../services/campaignDeliveryService');
const { WhatsAppApiError } = require('../../services/whatsappService');

test('buildMetaTemplatePayload monta header image + body vars', () => {
  const payload = buildMetaTemplatePayload({
    headline: 'Promo HighLine',
    message_template: 'Venha sábado!',
    image_url: 'https://cdn.example.com/banner.jpg',
    meta_template_name: 'agilizai_campanha_marketing',
    meta_template_language: 'pt_BR',
  });
  assert.equal(payload.name, 'agilizai_campanha_marketing');
  assert.equal(payload.language.code, 'pt_BR');
  assert.equal(payload.components.length, 2);
  assert.equal(payload.components[0].type, 'header');
  assert.equal(payload.components[1].parameters.length, 2);
});

test('campaignPreviewText inclui título e imagem', () => {
  const text = campaignPreviewText({
    headline: 'Título',
    message_template: 'Corpo',
    image_url: 'https://x.com/a.jpg',
  });
  assert.match(text, /Título/);
  assert.match(text, /\[imagem\]/);
  assert.match(text, /Corpo/);
});

test('defaultTemplateName tem fallback', () => {
  const prev = process.env.WHATSAPP_CAMPAIGN_TEMPLATE_NAME;
  delete process.env.WHATSAPP_CAMPAIGN_TEMPLATE_NAME;
  assert.equal(defaultTemplateName(), 'agilizai_campanha_marketing');
  if (prev) process.env.WHATSAPP_CAMPAIGN_TEMPLATE_NAME = prev;
});

test('resolveEffectiveDeliveryMode usa template fora da janela 24h', async () => {
  const pool = { query: async () => ({ rows: [] }) };
  const mode = await resolveEffectiveDeliveryMode(
    pool,
    { send_mode: 'auto', meta_template_name: 'agilizai_campanha_marketing' },
    '5511999999999'
  );
  assert.equal(mode, 'template');
});

test('resolveEffectiveDeliveryMode usa session dentro da janela', async () => {
  const pool = { query: async () => ({ rows: [{ ok: 1 }] }) };
  const mode = await resolveEffectiveDeliveryMode(
    pool,
    { send_mode: 'auto', meta_template_name: 'agilizai_campanha_marketing' },
    '5511999999999'
  );
  assert.equal(mode, 'session');
});

test('formatCampaignDeliveryError traduz template inexistente', () => {
  const err = new WhatsAppApiError('Falha ao enviar template no WhatsApp: 404 {}', {
    status: 404,
    responseBody: { error: { code: 132001, message: 'Template name does not exist' } },
    isTransient: false,
  });
  const msg = formatCampaignDeliveryError(err);
  assert.match(msg, /Template Meta não encontrado/);
});

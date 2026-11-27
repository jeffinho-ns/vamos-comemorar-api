'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { HOUSE_RULES_BY_ESTABLISHMENT } = require('../../services/agent/houseRulesCatalog');
const { SEU_JUSTINO_FAQS } = require('../../services/agent/seuJustinoFaqCatalog');
const { PRACINHA_FAQS } = require('../../services/agent/pracinhaFaqCatalog');
const { HIGHLINE_FAQS } = require('../../services/agent/highlineFaqCatalog');
const {
  RESERVA_ROOFTOP_FAQS,
  RESERVA_PINHEIROS_FAQS,
} = require('../../services/agent/reservaRooftopFaqCatalog');
const { detectFaqTopicsFromUserText } = require('../../services/agent/faqTopicCanonical');
const { isCustomerFacingFaqEntry } = require('../../services/agent/faqPromptFilter');
const { AgentPromptBuilder } = require('../../services/agent/AgentPromptBuilder');

test('todas as casas principais possuem regras de comportamento separadas (custom_rules) e use_bullets=false', () => {
  for (const id of [1, 7, 8, 9, 21]) {
    const cfg = HOUSE_RULES_BY_ESTABLISHMENT[id];
    assert.ok(cfg, `falta configuração de regras para id=${id}`);
    assert.equal(cfg.use_bullets, false, `use_bullets deve ser false em id=${id}`);
    assert.ok(Array.isArray(cfg.custom_rules) && cfg.custom_rules.length >= 3, `custom_rules vazio em id=${id}`);
    for (const rule of cfg.custom_rules) {
      assert.ok(rule.length > 20, `regra curta demais em id=${id}`);
    }
  }
});

test('nenhuma ficha de Informações adicionais contém meta-regra bloqueada ou formulário em bullets', () => {
  const all = [
    ['Justino', SEU_JUSTINO_FAQS],
    ['Pracinha', PRACINHA_FAQS],
    ['HighLine', HIGHLINE_FAQS],
    ['Reserva Rooftop', RESERVA_ROOFTOP_FAQS],
    ['Reserva Pinheiros', RESERVA_PINHEIROS_FAQS],
  ];

  for (const [label, list] of all) {
    const seen = new Set();
    for (const faq of list) {
      assert.equal(seen.has(faq.topic), false, `${label}: tópico duplicado ${faq.topic}`);
      seen.add(faq.topic);
      assert.equal(isCustomerFacingFaqEntry(faq), true, `${label}: ficha filtrada ${faq.topic}`);
      assert.doesNotMatch(faq.answer, /\(\s*\)\s*Sim\s*\(\s*\)\s*N[aã]o/i, `${label}: formulário em ${faq.topic}`);
      assert.doesNotMatch(faq.answer, /utm_source=chatgpt/i, `${label}: utm sujo em ${faq.topic}`);
    }
  }
});

test('Reserva Rooftop (id=9) acha tópicos de unidades, feijoada, vinho, rolha, Natal, Prime Gourmet e pagamento', () => {
  const opts = { establishmentId: 9 };
  assert.ok(detectFaqTopicsFromUserText('Vocês têm unidade em Pinheiros ou Perdizes?', opts).includes('unidades'));
  assert.ok(detectFaqTopicsFromUserText('Aceita Prime Gourmet e Duo Gourmet?', opts).includes('beneficios_programas'));
  assert.ok(detectFaqTopicsFromUserText('Vai ter ceia de Natal?', opts).includes('natal'));
  assert.ok(detectFaqTopicsFromUserText('Qual a taxa de rolha para levar vinho?', opts).includes('taxa_rolha'));
  assert.ok(detectFaqTopicsFromUserText('Tem promoção de vinho?', opts).includes('promocao_vinho'));
  assert.ok(detectFaqTopicsFromUserText('Aceita vale refeição Alelo e Pix?', opts).includes('formas_pagamento'));
  assert.ok(detectFaqTopicsFromUserText('Onde fica o endereço?', opts).includes('como_chegar'));
  assert.ok(detectFaqTopicsFromUserText('Pode ir com criança?', opts).includes('menores_criancas'));
});

test('escopo do Reserva Rooftop orienta perguntar unidade antes e fechar automático em Perdizes', () => {
  const builder = new AgentPromptBuilder();
  const block = builder.buildScopeNoticeBlock({
    lockedEstablishmentId: 9,
    lockedEstablishmentName: 'Reserva Rooftop',
  });
  assert.match(block, /Perdizes/);
  assert.match(block, /Reserva Pinheiros/);
  assert.match(block, /Área Interna/);
  assert.match(block, /Não envie formulário/i);
});

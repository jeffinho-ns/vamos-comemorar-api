const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeKindOrDefault,
  inferTriggerFromUsage,
  buildPromptBlock,
  selectAssets,
  looksLikeHousePhotoAsk,
  looksLikeDateFlyerAsk,
  collectArtsFromToolTrace,
} = require('../../services/flyer/flyerAssetCatalog');

test('casa e informação são tipos distintos', () => {
  assert.equal(normalizeKindOrDefault('imagens da casa'), 'casa');
  assert.equal(normalizeKindOrDefault('info'), 'informacao');
});

test('legenda de etiqueta vira disparo ao fechar reserva', () => {
  assert.equal(
    inferTriggerFromUsage(
      'informacao',
      'Essa imagem deve ser enviada quando a reserva for fechada pois se trata de dicas de etiqueta'
    ),
    'reserva_criada'
  );
});

test('imagens da casa ficam sob demanda por padrão', () => {
  assert.equal(inferTriggerFromUsage('casa', 'área externa'), 'sob_demanda');
});

test('catálogo no prompt lista ids para a Sol', () => {
  const block = buildPromptBlock([
    { id: 10, asset_kind: 'casa', usage_hint: 'área externa', is_active: true },
    { id: 11, asset_kind: 'informacao', usage_hint: 'dress code ao fechar reserva', is_active: true },
  ]);
  assert.match(block, /#10 área externa/);
  assert.match(block, /#11 dress code/);
  assert.match(block, /enviar_arte/);
});

test('seleciona foto da casa pela legenda', () => {
  const assets = [
    { id: 1, asset_kind: 'casa', usage_hint: 'área externa', media_url: 'http://a' },
    { id: 2, asset_kind: 'casa', usage_hint: 'bar', media_url: 'http://b' },
    { id: 3, asset_kind: 'informacao', usage_hint: 'etiqueta', media_url: 'http://c' },
  ];
  const picked = selectAssets({ assets, kind: 'casa', query: 'quero ver a área externa' });
  assert.equal(picked.length, 1);
  assert.equal(picked[0].id, 1);
});

test('pedido de foto da casa é reconhecido', () => {
  assert.equal(looksLikeHousePhotoAsk('me manda uma foto da área externa'), true);
  assert.equal(looksLikeHousePhotoAsk('Area descoberta por favoor'), false);
  assert.equal(looksLikeDateFlyerAsk('qual a programação de sábado?'), true);
});

test('coleta artes da tool sem repetir id', () => {
  const arts = collectArtsFromToolTrace([
    {
      name: 'enviar_arte',
      result: {
        artes_para_enviar: [
          { id: 1, media_url: 'http://a' },
          { id: 1, media_url: 'http://a' },
          { id: 2, media_url: 'http://b' },
        ],
      },
    },
  ]);
  assert.equal(arts.length, 2);
});

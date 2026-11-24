'use strict';

const ASSET_KINDS = ['informacao', 'datas', 'casa'];
const AUTO_EVENTS = new Set(['reserva_criada', 'reserva_cancelada', 'pos_visita']);
const TRIGGER_EVENTS = new Set([...AUTO_EVENTS, 'sob_demanda']);

function fold(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeKind(value) {
  const v = fold(value).replace(/\s+/g, '_');
  if (v === 'info' || v === 'informacao' || v === 'flyer_informacao') return 'informacao';
  if (v === 'data' || v === 'datas' || v === 'programacao' || v === 'flyer_datas') return 'datas';
  if (v === 'casa' || v === 'house' || v === 'ambiente' || v === 'imagens_da_casa') return 'casa';
  return '';
}

function normalizeKindOrDefault(value) {
  return normalizeKind(value) || 'informacao';
}

function defaultTriggerForKind(kind) {
  return normalizeKindOrDefault(kind) === 'informacao' ? 'reserva_criada' : 'sob_demanda';
}

function inferTriggerFromUsage(kind, usageHint, explicitEvent) {
  const explicit = String(explicitEvent || '')
    .trim()
    .toLowerCase();
  if (TRIGGER_EVENTS.has(explicit)) return explicit;
  const t = fold(usageHint);
  if (/reserva (for )?fechada|quando (a )?reserva|apos (a )?reserva|ao fechar|dress|etiqueta|como se vestir/.test(t)) {
    return 'reserva_criada';
  }
  if (/cancel/.test(t)) return 'reserva_cancelada';
  if (/pos.?visita|satisfacao|depois da visita/.test(t)) return 'pos_visita';
  return defaultTriggerForKind(kind);
}

function normalizeEvent(value, kind, usageHint) {
  return inferTriggerFromUsage(kind, usageHint, value);
}

function isAutoEvent(event) {
  return AUTO_EVENTS.has(String(event || ''));
}

function buildPromptBlock(assets) {
  const rows = (assets || []).filter((a) => a && Number(a.id) > 0 && a.is_active !== false);
  if (!rows.length) return '';
  const byKind = { informacao: [], datas: [], casa: [] };
  for (const asset of rows) {
    const kind = normalizeKindOrDefault(asset.asset_kind);
    if (!byKind[kind]) continue;
    const hint = String(asset.usage_hint || asset.title || '').trim() || 'sem legenda';
    byKind[kind].push(`#${asset.id} ${hint}`);
  }
  const lines = [
    'ARTES DA CASA — use a tool enviar_arte com o id quando for o caso:',
  ];
  if (byKind.informacao.length) {
    lines.push(`Flyer de informação: ${byKind.informacao.join('; ')}`);
  }
  if (byKind.datas.length) {
    lines.push(`Flyer de datas: ${byKind.datas.join('; ')}`);
  }
  if (byKind.casa.length) {
    lines.push(`Imagens da casa: ${byKind.casa.join('; ')}`);
  }
  lines.push(
    'Foto da casa/área/bar: envie as imagens da casa que combinam. Programação/datas: flyer de datas. Etiqueta, dress code ou dica após fechar reserva: flyer de informação (o disparo automático também cobre reserva_criada). Máximo 3 artes por turno. Não invente foto que não está nesta lista.'
  );
  return lines.join('\n');
}

function scoreAsset(asset, queryFold) {
  if (!queryFold) return 0;
  const hay = fold(`${asset.title || ''} ${asset.usage_hint || ''} ${asset.caption || ''}`);
  if (!hay) return 0;
  if (hay.includes(queryFold)) return 8;
  const tokens = queryFold.split(/\s+/).filter((token) => token.length > 3);
  let score = 0;
  for (const token of tokens) {
    if (hay.includes(token)) score += 2;
  }
  return score;
}

function selectAssets({ assets, kind, query, ids, limit = 3 } = {}) {
  const wantedKind = normalizeKind(kind);
  const wantedIds = Array.isArray(ids)
    ? ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
    : [];
  let list = (assets || []).filter((asset) => asset && asset.media_url);
  if (wantedIds.length) {
    const set = new Set(wantedIds);
    list = list.filter((asset) => set.has(Number(asset.id)));
    return list.slice(0, Math.max(1, Math.min(Number(limit) || 3, 5)));
  }
  if (wantedKind) {
    list = list.filter((asset) => normalizeKindOrDefault(asset.asset_kind) === wantedKind);
  }
  const queryFold = fold(query);
  if (queryFold) {
    list = list
      .map((asset) => ({ asset, score: scoreAsset(asset, queryFold) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((row) => row.asset);
  }
  return list.slice(0, Math.max(1, Math.min(Number(limit) || 3, 5)));
}

function looksLikeHousePhotoAsk(text) {
  const t = fold(text);
  return /\b(foto|fotos|imagem|imagens)\b/.test(t) ||
    /\b(me mostra|me manda|mostrar)\b/.test(t) &&
      /\b(casa|lugar|ambiente|espaco|bar|area)\b/.test(t);
}

function looksLikeDateFlyerAsk(text) {
  const t = fold(text);
  return /\b(flyer de data|programacao|o que tem (hoje|amanha|no|na)|line ?up|atracao|dj)\b/.test(t);
}

function collectArtsFromToolTrace(toolTrace) {
  const seen = new Set();
  const out = [];
  for (const entry of toolTrace || []) {
    if (entry?.name !== 'enviar_arte') continue;
    const list = entry?.result?.artes_para_enviar || [];
    for (const art of list) {
      const id = Number(art?.id);
      if (!art?.media_url || seen.has(id)) continue;
      seen.add(id);
      out.push(art);
    }
  }
  return out;
}

function mapArtForSend(asset) {
  return {
    id: Number(asset.id),
    media_url: asset.media_url,
    caption: String(asset.caption || '').trim(),
    asset_kind: normalizeKindOrDefault(asset.asset_kind),
    title: String(asset.title || '').trim(),
  };
}

module.exports = {
  ASSET_KINDS,
  TRIGGER_EVENTS,
  AUTO_EVENTS,
  fold,
  normalizeKind,
  normalizeKindOrDefault,
  defaultTriggerForKind,
  inferTriggerFromUsage,
  normalizeEvent,
  isAutoEvent,
  buildPromptBlock,
  selectAssets,
  looksLikeHousePhotoAsk,
  looksLikeDateFlyerAsk,
  collectArtsFromToolTrace,
  mapArtForSend,
};

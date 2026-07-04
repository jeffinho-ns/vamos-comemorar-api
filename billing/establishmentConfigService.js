'use strict';

const { logAction } = require('../middleware/actionLogger');
const {
  clearRulesCache,
  previewMergedRules,
} = require('../services/establishmentRules');

function deepMergeConfig(base, extra) {
  if (!extra || typeof extra !== 'object') return { ...(base || {}) };
  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(extra)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' && out[k] != null) {
      out[k] = deepMergeConfig(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

const VALID_PROFILES = new Set([
  'rooftop',
  'pracinha',
  'highline',
  'oh_fregues',
  'seu_justino',
  'sitio_ilha',
  'generic',
]);

function operationalIdFromRow(row) {
  const placeId = Number(row?.legacy_place_id);
  if (Number.isFinite(placeId) && placeId > 0) return placeId;
  const barId = Number(row?.legacy_bar_id);
  if (Number.isFinite(barId) && barId > 0) return barId;
  return null;
}

function parsePositiveInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function parseAliases(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0))];
  }
  if (typeof value === 'string') {
    return [
      ...new Set(
        value
          .split(/[,;\s]+/)
          .map((part) => Number(part.trim()))
          .filter((n) => Number.isFinite(n) && n > 0),
      ),
    ];
  }
  return [];
}

/**
 * Monta patch JSONB para merge em establishments.config a partir do body do superadmin.
 */
function buildConfigPatch(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Corpo inválido.');
  }

  const patch = {};

  if (body.profile !== undefined) {
    const profile = String(body.profile || '').trim().toLowerCase();
    if (!VALID_PROFILES.has(profile)) {
      throw new Error(`Profile inválido. Use: ${[...VALID_PROFILES].join(', ')}`);
    }
    patch.profile = profile;
  }

  const rules = {};

  if (body.cardapioBarId !== undefined) {
    const barId = parsePositiveInt(body.cardapioBarId);
    rules.cardapio = { barId: barId ?? null };
  }

  if (body.operationalAliases !== undefined) {
    rules.operationalAliases = parseAliases(body.operationalAliases);
  }

  const reservations = {};
  if (body.maxDaily !== undefined) {
    reservations.maxDaily = parsePositiveInt(body.maxDaily);
  }
  if (body.maxPartySize !== undefined) {
    reservations.maxPartySize = parsePositiveInt(body.maxPartySize);
  }
  if (body.areaNamePrefix !== undefined) {
    reservations.areaNamePrefix = String(body.areaNamePrefix || '').trim() || null;
  }
  if (body.excludeAreaPrefix !== undefined) {
    reservations.excludeAreaPrefix = String(body.excludeAreaPrefix || '').trim() || null;
  }
  if (body.dualShift !== undefined) {
    reservations.dualShift = !!body.dualShift;
  }
  if (body.strictHours !== undefined) {
    reservations.strictHours = !!body.strictHours;
  }
  if (body.tableBlocking !== undefined) {
    const tb = String(body.tableBlocking || '').trim().toLowerCase();
    if (tb && !['overlap', 'full_day', 'none'].includes(tb)) {
      throw new Error('tableBlocking deve ser overlap, full_day ou none');
    }
    reservations.tableBlocking = tb === 'none' ? null : tb || null;
  }

  if (Object.keys(reservations).length > 0) {
    rules.reservations = reservations;
  }

  const events = {};
  if (body.extendedGuestListWindow !== undefined) {
    events.extendedGuestListWindow = !!body.extendedGuestListWindow;
  }
  if (Object.keys(events).length > 0) {
    rules.events = events;
  }

  if (Object.keys(rules).length > 0) {
    patch.rules = rules;
  }

  if (Object.keys(patch).length === 0) {
    throw new Error('Nenhum campo para atualizar.');
  }

  return patch;
}

async function fetchEstablishmentRow(pool, establishmentId) {
  const { rows } = await pool.query(
    `SELECT id, organization_id, slug, name, status, legacy_place_id, legacy_bar_id, config
       FROM meu_backup_db.establishments
      WHERE id = $1
      LIMIT 1`,
    [establishmentId],
  );
  return rows[0] || null;
}

function buildDetailPayload(row) {
  const operationalId = operationalIdFromRow(row);
  const config = row.config && typeof row.config === 'object' ? row.config : {};
  const rules = config.rules || {};
  const reservations = rules.reservations || {};
  const cardapio = rules.cardapio || {};
  const events = rules.events || {};

  const mergedPreview =
    operationalId != null
      ? previewMergedRules(config, row.name, operationalId)
      : previewMergedRules(config, row.name, 0);

  return {
    establishment: {
      id: row.id,
      organization_id: row.organization_id,
      slug: row.slug,
      name: row.name,
      status: row.status,
      legacy_place_id: row.legacy_place_id,
      legacy_bar_id: row.legacy_bar_id,
      operational_id: operationalId,
    },
    config,
    form: {
      profile: config.profile || mergedPreview.profile || 'generic',
      cardapioBarId: cardapio.barId ?? mergedPreview.cardapio?.barId ?? null,
      operationalAliases: rules.operationalAliases || mergedPreview.operationalAliases || [],
      maxDaily: reservations.maxDaily ?? mergedPreview.reservations?.maxDaily ?? null,
      maxPartySize: reservations.maxPartySize ?? mergedPreview.reservations?.maxPartySize ?? null,
      areaNamePrefix:
        reservations.areaNamePrefix ?? mergedPreview.reservations?.areaNamePrefix ?? '',
      excludeAreaPrefix:
        reservations.excludeAreaPrefix ?? mergedPreview.reservations?.excludeAreaPrefix ?? '',
      dualShift: !!(reservations.dualShift ?? mergedPreview.reservations?.dualShift),
      strictHours: !!(reservations.strictHours ?? mergedPreview.reservations?.strictHours),
      tableBlocking:
        reservations.tableBlocking ?? mergedPreview.reservations?.tableBlocking ?? 'none',
      extendedGuestListWindow: !!(
        events.extendedGuestListWindow ?? mergedPreview.events?.extendedGuestListWindow
      ),
    },
    mergedPreview,
    profiles: [...VALID_PROFILES],
  };
}

async function getEstablishmentConfigDetail(pool, establishmentId) {
  const row = await fetchEstablishmentRow(pool, establishmentId);
  if (!row) return null;
  return buildDetailPayload(row);
}

async function patchEstablishmentConfig(pool, establishmentId, body, actor, requestMeta = {}) {
  const row = await fetchEstablishmentRow(pool, establishmentId);
  if (!row) return null;

  const patch = buildConfigPatch(body);
  const currentConfig =
    row.config && typeof row.config === 'object' ? row.config : {};
  const nextConfig = deepMergeConfig(currentConfig, patch);

  const { rows } = await pool.query(
    `UPDATE meu_backup_db.establishments
        SET config = $2::jsonb
      WHERE id = $1
      RETURNING id, organization_id, slug, name, status, legacy_place_id, legacy_bar_id, config`,
    [establishmentId, JSON.stringify(nextConfig)],
  );

  clearRulesCache();

  const updated = rows[0];
  const detail = buildDetailPayload(updated);

  try {
    await logAction(pool, {
      userId: actor?.id,
      userName: actor?.name || actor?.email,
      userEmail: actor?.email,
      userRole: actor?.role,
      actionType: 'update',
      actionDescription: `Superadmin atualizou config do estabelecimento ${updated.name}`,
      resourceType: 'establishment_config',
      resourceId: String(establishmentId),
      establishmentId: operationalIdFromRow(updated),
      establishmentName: updated.name,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      requestMethod: requestMeta.requestMethod,
      requestUrl: requestMeta.requestUrl,
      additionalData: { patch },
    });
  } catch (_) {
    /* auditoria não bloqueia */
  }

  return detail;
}

module.exports = {
  VALID_PROFILES,
  getEstablishmentConfigDetail,
  patchEstablishmentConfig,
  buildConfigPatch,
};

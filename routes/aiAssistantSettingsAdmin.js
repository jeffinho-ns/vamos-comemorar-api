const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const {
  RESPONSE_SIZES,
  TONES,
  GENDERS,
  SLANG_INTENSITIES,
  getSettingsForAdmin,
  invalidateSettingsCache,
} = require('../services/agent/assistantSettingsService');

const ADMIN_ROLES = ['admin', 'gerente', 'administrador', 'recepção'];

function parseEstablishmentId(value) {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

async function establishmentExists(pool, establishmentId) {
  const result = await pool.query('SELECT id FROM places WHERE id = $1 LIMIT 1', [establishmentId]);
  return Boolean(result.rows[0]);
}

function pickEnum(value, allowed, fallback) {
  const v = String(value || '').trim().toLowerCase();
  return allowed.has(v) ? v : fallback;
}

function normalizeRules(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 40);
}

function normalizeChannels(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const allowed = new Set(['whatsapp', 'instagram']);
  const out = value.map((v) => String(v || '').trim().toLowerCase()).filter((v) => allowed.has(v));
  return out.length ? Array.from(new Set(out)) : fallback;
}

/** Monta o objeto a persistir mesclando o body sobre os defaults/atual. */
function buildPayload(body, current) {
  const name = body.assistant_name !== undefined
    ? String(body.assistant_name || '').trim().slice(0, 80)
    : current.assistant_name;
  const slang = body.slang_text !== undefined
    ? String(body.slang_text || '').trim().slice(0, 2000)
    : current.slang_text;

  return {
    is_active: body.is_active !== undefined ? Boolean(body.is_active) : current.is_active,
    assistant_name: name,
    gender: body.gender !== undefined ? pickEnum(body.gender, GENDERS, current.gender) : current.gender,
    response_size:
      body.response_size !== undefined
        ? pickEnum(body.response_size, RESPONSE_SIZES, current.response_size)
        : current.response_size,
    tone: body.tone !== undefined ? pickEnum(body.tone, TONES, current.tone) : current.tone,
    use_emojis: body.use_emojis !== undefined ? Boolean(body.use_emojis) : current.use_emojis,
    use_bullets: body.use_bullets !== undefined ? Boolean(body.use_bullets) : current.use_bullets,
    use_greeting: body.use_greeting !== undefined ? Boolean(body.use_greeting) : current.use_greeting,
    greet_when_already_greeted:
      body.greet_when_already_greeted !== undefined
        ? Boolean(body.greet_when_already_greeted)
        : current.greet_when_already_greeted,
    slang_text: slang,
    slang_intensity:
      body.slang_intensity !== undefined
        ? pickEnum(body.slang_intensity, SLANG_INTENSITIES, current.slang_intensity)
        : current.slang_intensity,
    custom_rules: body.custom_rules !== undefined ? normalizeRules(body.custom_rules) : current.custom_rules,
    behavior_config:
      body.behavior_config !== undefined && body.behavior_config && typeof body.behavior_config === 'object'
        ? body.behavior_config
        : current.behavior_config,
    follow_up_config:
      body.follow_up_config !== undefined && body.follow_up_config && typeof body.follow_up_config === 'object'
        ? body.follow_up_config
        : current.follow_up_config,
    ice_breakers_enabled:
      body.ice_breakers_enabled !== undefined
        ? Boolean(body.ice_breakers_enabled)
        : current.ice_breakers_enabled,
    ice_breakers_channels:
      body.ice_breakers_channels !== undefined
        ? normalizeChannels(body.ice_breakers_channels, current.ice_breakers_channels)
        : current.ice_breakers_channels,
    ai_globally_enabled:
      body.ai_globally_enabled !== undefined
        ? Boolean(body.ai_globally_enabled)
        : current.ai_globally_enabled,
  };
}

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });

  router.get(
    '/establishments/:id/ai-settings',
    auth,
    authorize(...ADMIN_ROLES),
    async (req, res) => {
      try {
        const establishmentId = parseEstablishmentId(req.params.id);
        if (!establishmentId) {
          return res.status(400).json({ success: false, message: 'ID de estabelecimento inválido.' });
        }
        if (!(await establishmentExists(pool, establishmentId))) {
          return res.status(404).json({ success: false, message: 'Estabelecimento não encontrado.' });
        }

        const data = await getSettingsForAdmin(pool, establishmentId);
        return res.json({ success: true, data });
      } catch (error) {
        console.error('[ai-settings] get:', error.message);
        return res.status(500).json({ success: false, message: 'Falha ao carregar configurações da IA.' });
      }
    }
  );

  router.put(
    '/establishments/:id/ai-settings',
    auth,
    authorize(...ADMIN_ROLES),
    async (req, res) => {
      try {
        const establishmentId = parseEstablishmentId(req.params.id);
        if (!establishmentId) {
          return res.status(400).json({ success: false, message: 'ID de estabelecimento inválido.' });
        }
        if (!(await establishmentExists(pool, establishmentId))) {
          return res.status(404).json({ success: false, message: 'Estabelecimento não encontrado.' });
        }

        const current = await getSettingsForAdmin(pool, establishmentId);
        const payload = buildPayload(req.body || {}, current);

        const result = await pool.query(
          `INSERT INTO ai_assistant_settings (
             establishment_id, is_active, assistant_name, gender, response_size, tone,
             use_emojis, use_bullets, use_greeting, greet_when_already_greeted,
             slang_text, slang_intensity, custom_rules, behavior_config, follow_up_config,
             ice_breakers_enabled, ice_breakers_channels, ai_globally_enabled, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15::jsonb,
             $16, $17::jsonb, $18, NOW()
           )
           ON CONFLICT (establishment_id) DO UPDATE SET
             is_active = EXCLUDED.is_active,
             assistant_name = EXCLUDED.assistant_name,
             gender = EXCLUDED.gender,
             response_size = EXCLUDED.response_size,
             tone = EXCLUDED.tone,
             use_emojis = EXCLUDED.use_emojis,
             use_bullets = EXCLUDED.use_bullets,
             use_greeting = EXCLUDED.use_greeting,
             greet_when_already_greeted = EXCLUDED.greet_when_already_greeted,
             slang_text = EXCLUDED.slang_text,
             slang_intensity = EXCLUDED.slang_intensity,
             custom_rules = EXCLUDED.custom_rules,
             behavior_config = EXCLUDED.behavior_config,
             follow_up_config = EXCLUDED.follow_up_config,
             ice_breakers_enabled = EXCLUDED.ice_breakers_enabled,
             ice_breakers_channels = EXCLUDED.ice_breakers_channels,
             ai_globally_enabled = EXCLUDED.ai_globally_enabled,
             updated_at = NOW()
           RETURNING establishment_id, is_active, assistant_name, gender, response_size, tone,
             use_emojis, use_bullets, use_greeting, greet_when_already_greeted,
             slang_text, slang_intensity, custom_rules, behavior_config, follow_up_config,
             ice_breakers_enabled, ice_breakers_channels, ai_globally_enabled,
             updated_at, created_at`,
          [
            establishmentId,
            payload.is_active,
            payload.assistant_name,
            payload.gender,
            payload.response_size,
            payload.tone,
            payload.use_emojis,
            payload.use_bullets,
            payload.use_greeting,
            payload.greet_when_already_greeted,
            payload.slang_text,
            payload.slang_intensity,
            JSON.stringify(payload.custom_rules),
            JSON.stringify(payload.behavior_config),
            JSON.stringify(payload.follow_up_config),
            payload.ice_breakers_enabled,
            JSON.stringify(payload.ice_breakers_channels),
            payload.ai_globally_enabled,
          ]
        );

        invalidateSettingsCache(establishmentId);
        return res.json({ success: true, data: result.rows[0] });
      } catch (error) {
        console.error('[ai-settings] update:', error.message);
        return res.status(500).json({ success: false, message: 'Falha ao salvar configurações da IA.' });
      }
    }
  );

  return router;
};

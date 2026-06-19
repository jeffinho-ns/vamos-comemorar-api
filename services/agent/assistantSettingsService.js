/**
 * Carrega as configurações de identidade/personalidade da IA por estabelecimento
 * (tabela ai_assistant_settings) e expõe os valores normalizados para o
 * AgentPromptBuilder. Quando não há linha cadastrada — ou is_active = false —
 * o agente continua usando a persona/comportamento hard-coded (fallback seguro).
 *
 * Feature flag por casa: a coluna is_active funciona como o "liga só na casa
 * piloto". Há ainda um kill-switch global via env AI_ASSISTANT_SETTINGS_ENABLED.
 */

const SETTINGS_CACHE = new Map();
const LINKS_CACHE = new Map();
const GATE_CACHE = new Map();
const CACHE_TTL_MS = 60 * 1000;

const RESPONSE_SIZES = new Set(['curta', 'media', 'longa']);
const TONES = new Set(['amigavel', 'neutro', 'formal']);
const GENDERS = new Set(['feminino', 'masculino', 'neutro']);
const SLANG_INTENSITIES = new Set(['nunca', 'leve', 'moderado', 'intenso']);

function isFeatureEnabledGlobally() {
  const raw = String(process.env.AI_ASSISTANT_SETTINGS_ENABLED || 'true').toLowerCase();
  return raw !== 'false' && raw !== '0';
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

function normalizeChannels(value) {
  if (!Array.isArray(value)) return ['whatsapp'];
  const allowed = new Set(['whatsapp', 'instagram']);
  const out = value.map((v) => String(v || '').trim().toLowerCase()).filter((v) => allowed.has(v));
  return out.length ? Array.from(new Set(out)) : ['whatsapp'];
}

function mapSettingsRow(row) {
  if (!row) return null;
  return {
    establishment_id: row.establishment_id,
    is_active: Boolean(row.is_active),
    assistant_name: String(row.assistant_name || '').trim(),
    gender: pickEnum(row.gender, GENDERS, 'feminino'),
    response_size: pickEnum(row.response_size, RESPONSE_SIZES, 'media'),
    tone: pickEnum(row.tone, TONES, 'amigavel'),
    use_emojis: Boolean(row.use_emojis),
    use_bullets: Boolean(row.use_bullets),
    use_greeting: Boolean(row.use_greeting),
    greet_when_already_greeted: Boolean(row.greet_when_already_greeted),
    slang_text: String(row.slang_text || '').trim(),
    slang_intensity: pickEnum(row.slang_intensity, SLANG_INTENSITIES, 'leve'),
    custom_rules: normalizeRules(row.custom_rules),
    behavior_config: row.behavior_config && typeof row.behavior_config === 'object' ? row.behavior_config : {},
    follow_up_config: row.follow_up_config && typeof row.follow_up_config === 'object' ? row.follow_up_config : {},
    ice_breakers_enabled: row.ice_breakers_enabled === undefined ? true : Boolean(row.ice_breakers_enabled),
    ice_breakers_channels: normalizeChannels(row.ice_breakers_channels),
    ai_globally_enabled: row.ai_globally_enabled === undefined ? true : Boolean(row.ai_globally_enabled),
    updated_at: row.updated_at,
    created_at: row.created_at,
  };
}

function getDefaults(establishmentId) {
  return {
    establishment_id: Number(establishmentId) || null,
    is_active: false,
    assistant_name: '',
    gender: 'feminino',
    response_size: 'media',
    tone: 'amigavel',
    use_emojis: true,
    use_bullets: false,
    use_greeting: true,
    greet_when_already_greeted: false,
    slang_text: '',
    slang_intensity: 'leve',
    custom_rules: [],
    behavior_config: {},
    follow_up_config: {},
    ice_breakers_enabled: true,
    ice_breakers_channels: ['whatsapp'],
    ai_globally_enabled: true,
    updated_at: null,
    created_at: null,
  };
}

async function fetchSettingsRow(pool, establishmentId) {
  const result = await pool.query(
    `SELECT establishment_id, is_active, assistant_name, gender, response_size, tone,
            use_emojis, use_bullets, use_greeting, greet_when_already_greeted,
            slang_text, slang_intensity, custom_rules, behavior_config, follow_up_config,
            ice_breakers_enabled, ice_breakers_channels, ai_globally_enabled,
            updated_at, created_at
       FROM ai_assistant_settings
      WHERE establishment_id = $1
      LIMIT 1`,
    [establishmentId]
  );
  return mapSettingsRow(result.rows[0]);
}

/**
 * Versão CRUD-friendly (sem cache, sem feature flag): usado pelas rotas de admin.
 * Retorna sempre um objeto (defaults quando não há linha).
 */
async function getSettingsForAdmin(pool, establishmentId) {
  const row = await fetchSettingsRow(pool, establishmentId);
  return row || getDefaults(establishmentId);
}

/**
 * Versão runtime (com cache + feature flag): usada pelo agente para montar o
 * prompt. Retorna null quando o agente deve usar o comportamento padrão.
 */
async function loadActiveSettings(pool, establishmentId) {
  const id = Number(establishmentId);
  if (!pool || !Number.isFinite(id) || id <= 0) return null;
  if (!isFeatureEnabledGlobally()) return null;

  const cached = SETTINGS_CACHE.get(id);
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  let value = null;
  try {
    const row = await fetchSettingsRow(pool, id);
    value = row && row.is_active ? row : null;
  } catch (error) {
    console.warn('[assistantSettings] falha ao carregar config da IA:', error.message);
    value = null;
  }

  SETTINGS_CACHE.set(id, { at: now, value });
  return value;
}

function invalidateSettingsCache(establishmentId) {
  if (establishmentId === undefined) {
    SETTINGS_CACHE.clear();
    LINKS_CACHE.clear();
    GATE_CACHE.clear();
    return;
  }
  const id = Number(establishmentId);
  SETTINGS_CACHE.delete(id);
  LINKS_CACHE.delete(id);
  GATE_CACHE.delete(id);
}

/** Links oficiais (cardápio, reserva, fila, CRM) que a IA pode compartilhar. */
async function loadExternalLinksBlock(pool, establishmentId) {
  const id = Number(establishmentId);
  if (!pool || !Number.isFinite(id) || id <= 0) return '';

  const cached = LINKS_CACHE.get(id);
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.value;

  let block = '';
  try {
    const result = await pool.query(
      `SELECT title, url, description
         FROM ai_external_links
        WHERE establishment_id = $1 AND is_active = TRUE AND url <> ''
        ORDER BY sort_order ASC, id ASC`,
      [id]
    );
    if (result.rows.length) {
      const lines = result.rows.map((row) => {
        const title = String(row.title || '').trim() || 'Link';
        const desc = String(row.description || '').trim();
        return `- ${title}: ${row.url}${desc ? ` (${desc})` : ''}`;
      });
      block = `LINKS OFICIAIS (compartilhe quando o cliente pedir e fizer sentido):\n${lines.join('\n')}`;
    }
  } catch (error) {
    console.warn('[assistantSettings] falha ao carregar links externos:', error.message);
  }

  LINKS_CACHE.set(id, { at: now, value: block });
  return block;
}

/**
 * Gate de números habilitados: quando a IA está desativada globalmente para a
 * casa, só números na allow-list recebem resposta da IA. Default = liberado.
 */
async function loadInboundAccessGate(pool, establishmentId) {
  const id = Number(establishmentId);
  if (!pool || !Number.isFinite(id) || id <= 0) {
    return { aiGloballyEnabled: true, allowedNumbers: new Set() };
  }

  const cached = GATE_CACHE.get(id);
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.value;

  let value = { aiGloballyEnabled: true, allowedNumbers: new Set() };
  try {
    const settingsRes = await pool.query(
      `SELECT ai_globally_enabled FROM ai_assistant_settings WHERE establishment_id = $1 LIMIT 1`,
      [id]
    );
    const aiGloballyEnabled =
      settingsRes.rows[0] === undefined ? true : Boolean(settingsRes.rows[0].ai_globally_enabled);

    const allowedNumbers = new Set();
    if (!aiGloballyEnabled) {
      const numbersRes = await pool.query(
        `SELECT phone_e164 FROM ai_allowed_numbers WHERE establishment_id = $1`,
        [id]
      );
      numbersRes.rows.forEach((row) => {
        const digits = String(row.phone_e164 || '').replace(/\D/g, '');
        if (digits) allowedNumbers.add(digits);
      });
    }
    value = { aiGloballyEnabled, allowedNumbers };
  } catch (error) {
    console.warn('[assistantSettings] falha ao carregar gate de números:', error.message);
  }

  GATE_CACHE.set(id, { at: now, value });
  return value;
}

module.exports = {
  RESPONSE_SIZES,
  TONES,
  GENDERS,
  SLANG_INTENSITIES,
  mapSettingsRow,
  getDefaults,
  getSettingsForAdmin,
  loadActiveSettings,
  loadExternalLinksBlock,
  loadInboundAccessGate,
  invalidateSettingsCache,
};

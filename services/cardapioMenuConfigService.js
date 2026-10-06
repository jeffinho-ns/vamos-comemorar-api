'use strict';

const { resolveAccessibleBarIds, resolveActorScope } = require('../tenancy/orgIsolation');
const { fail, ensureCardapioBackupsTable } = require('./cardapioBackupService');

const OPTIONAL_BAR_COLUMNS = [
  'menu_category_bg_color',
  'menu_category_text_color',
  'menu_subcategory_bg_color',
  'menu_subcategory_text_color',
  'mobile_sidebar_bg_color',
  'mobile_sidebar_text_color',
  'menu_display_style',
  'custom_seals',
];

const SITIO_ILHA_BAR_ID = 15;
const SITIO_ILHA_CONFIG_EMAIL = 'jeffinho_ns@hotmail.com';

function normalizeHouseKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isSitioIlhaBar(bar) {
  if (Number(bar?.id) === SITIO_ILHA_BAR_ID) return true;
  const slug = normalizeHouseKey(bar?.slug).replace(/[^a-z0-9]/g, '');
  if (slug.includes('sitioilha')) return true;
  const name = normalizeHouseKey(bar?.name);
  return name.includes('sitio') && name.includes('ilha');
}

function canViewSitioIlhaConfig(email) {
  return String(email || '').trim().toLowerCase() === SITIO_ILHA_CONFIG_EMAIL;
}

async function actorEmail(pool, req) {
  const userId = Number(req.user?.id);
  if (Number.isFinite(userId) && userId > 0) {
    const result = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
    const email = String(result.rows[0]?.email || '').trim().toLowerCase();
    if (email) return email;
  }
  return String(req.user?.email || '').trim().toLowerCase();
}

async function assertSitioIlhaConfigAccess(pool, req, barId) {
  const email = await actorEmail(pool, req);
  if (canViewSitioIlhaConfig(email)) return;
  const result = await pool.query('SELECT id, name, slug FROM bars WHERE id = $1', [barId]);
  if (result.rows[0] && isSitioIlhaBar(result.rows[0])) {
    throw fail(404, 'Não encontrado');
  }
}

const COLOR_FIELDS = [
  'menu_category_bg_color',
  'menu_category_text_color',
  'menu_subcategory_bg_color',
  'menu_subcategory_text_color',
  'mobile_sidebar_bg_color',
  'mobile_sidebar_text_color',
];

function cleanColor(value) {
  if (value == null || String(value).trim() === '') return null;
  const color = String(value).trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    throw fail(400, 'Use uma cor no formato #RRGGBB.');
  }
  return color.toUpperCase();
}

function cleanSeals(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw fail(400, 'Selos inválidos.');
  if (value.length > 24) throw fail(400, 'No máximo 24 selos por casa.');
  return value.map((seal, index) => {
    const name = String(seal?.name || '').trim();
    if (!name || name.length > 40) {
      throw fail(400, 'Cada selo precisa de um nome de até 40 caracteres.');
    }
    const type = seal?.type === 'drink' ? 'drink' : 'food';
    const id = String(seal?.id || `seal-${index + 1}`).replace(/[^\w-]/g, '').slice(0, 40);
    return { id: id || `seal-${index + 1}`, name, color: cleanColor(seal?.color || '#DE5246'), type };
  });
}

function parseSeals(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

async function accessibleBarIds(pool, req) {
  const actor = await resolveActorScope(pool, req.user);
  return resolveAccessibleBarIds(pool, actor);
}

async function listMenuHouses(pool, req) {
  const barIds = await accessibleBarIds(pool, req);
  if (Array.isArray(barIds) && barIds.length === 0) return [];

  const params = [];
  let barFilter = '';
  if (Array.isArray(barIds)) {
    params.push(barIds);
    barFilter = `AND b.id = ANY($${params.length}::int[])`;
  }

  const columnResult = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'meu_backup_db'
        AND table_name = 'bars'
        AND column_name = ANY($1::text[])`,
    [OPTIONAL_BAR_COLUMNS],
  );
  const presentColumns = new Set(columnResult.rows.map((row) => row.column_name));
  const barFields = [
    'b.id',
    'b.name',
    'b.slug',
    ...OPTIONAL_BAR_COLUMNS.map((column) => (
      presentColumns.has(column) ? `b.${column}` : `NULL AS ${column}`
    )),
  ];
  const email = await actorEmail(pool, req);
  const bars = await pool.query(
    `SELECT ${barFields.join(', ')}
       FROM bars b
      WHERE NOT EXISTS (
        SELECT 1 FROM meu_backup_db.establishments e
         WHERE e.legacy_bar_id = b.id AND e.status = 'archived'
      )
      ${barFilter}
      ORDER BY b.name`,
    params,
  );
  const visibleRows = canViewSitioIlhaConfig(email)
    ? bars.rows
    : bars.rows.filter((bar) => !isSitioIlhaBar(bar));
  const ids = visibleRows.map((bar) => Number(bar.id));
  if (!ids.length) return [];

  const [orgs, categories, items, backups] = await Promise.all([
    pool.query(
      `SELECT DISTINCT ON (e.legacy_bar_id)
              e.legacy_bar_id AS bar_id, o.id AS organization_id, o.name AS organization_name
         FROM meu_backup_db.establishments e
         LEFT JOIN meu_backup_db.organizations o ON o.id = e.organization_id
        WHERE e.legacy_bar_id = ANY($1::int[])
          AND e.status IS DISTINCT FROM 'archived'
        ORDER BY e.legacy_bar_id, e.id`,
      [ids],
    ),
    pool.query(
      `SELECT barid AS bar_id, count(*)::int AS total
         FROM menu_categories
        WHERE barid = ANY($1::int[])
        GROUP BY barid`,
      [ids],
    ),
    pool.query(
      `SELECT barid AS bar_id,
              count(*) FILTER (WHERE deleted_at IS NULL)::int AS items,
              count(*) FILTER (
                WHERE deleted_at IS NULL
                  AND COALESCE(visible::text, '1') IN ('0', 'f', 'false')
              )::int AS hidden,
              count(*) FILTER (WHERE deleted_at IS NULL AND featured IS TRUE)::int AS featured
         FROM menu_items
        WHERE barid = ANY($1::int[])
        GROUP BY barid`,
      [ids],
    ).catch(() => pool.query(
      `SELECT barid AS bar_id, count(*)::int AS items, 0::int AS hidden, 0::int AS featured
         FROM menu_items
        WHERE barid = ANY($1::int[]) AND deleted_at IS NULL
        GROUP BY barid`,
      [ids],
    )),
    ensureCardapioBackupsTable(pool).then(() => pool.query(
      `SELECT DISTINCT ON (bar_id) bar_id, created_at
         FROM cardapio_backups
        WHERE bar_id = ANY($1::int[])
        ORDER BY bar_id, created_at DESC`,
      [ids],
    )).catch((error) => {
      console.error('Backup do cardápio indisponível:', error.message);
      return { rows: [] };
    }),
  ]);

  const orgByBar = new Map(orgs.rows.map((row) => [Number(row.bar_id), row]));
  const categoryByBar = new Map(categories.rows.map((row) => [Number(row.bar_id), row.total]));
  const itemByBar = new Map(items.rows.map((row) => [Number(row.bar_id), row]));
  const backupByBar = new Map(backups.rows.map((row) => [Number(row.bar_id), row.created_at]));

  const groups = new Map();
  for (const bar of visibleRows) {
    const org = orgByBar.get(Number(bar.id));
    const orgId = org?.organization_id == null ? 0 : Number(org.organization_id);
    const orgName = org?.organization_name || 'Outras casas';
    if (!groups.has(orgId)) groups.set(orgId, { id: orgId, name: orgName, houses: [] });
    const counts = itemByBar.get(Number(bar.id)) || {};
    groups.get(orgId).houses.push({
      barId: Number(bar.id),
      name: bar.name,
      slug: bar.slug,
      categoryCount: categoryByBar.get(Number(bar.id)) || 0,
      itemCount: Number(counts.items || 0),
      hiddenCount: Number(counts.hidden || 0),
      featuredCount: Number(counts.featured || 0),
      lastBackupAt: backupByBar.get(Number(bar.id)) || null,
      settings: {
        menuCategoryBgColor: bar.menu_category_bg_color || '',
        menuCategoryTextColor: bar.menu_category_text_color || '',
        menuSubcategoryBgColor: bar.menu_subcategory_bg_color || '',
        menuSubcategoryTextColor: bar.menu_subcategory_text_color || '',
        mobileSidebarBgColor: bar.mobile_sidebar_bg_color || '',
        mobileSidebarTextColor: bar.mobile_sidebar_text_color || '',
        menuDisplayStyle: bar.menu_display_style === 'clean' ? 'clean' : 'normal',
        customSeals: parseSeals(bar.custom_seals),
      },
    });
  }

  return Array.from(groups.values()).sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
}

async function updateMenuHouseSettings(pool, barId, body) {
  const style = body.menuDisplayStyle === 'clean' ? 'clean' : 'normal';
  const colors = COLOR_FIELDS.map((field) => {
    const camel = field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    return cleanColor(body[camel]);
  });
  const seals = cleanSeals(body.customSeals);
  try {
    await pool.query(
      `UPDATE bars SET
          menu_category_bg_color = $1,
          menu_category_text_color = $2,
          menu_subcategory_bg_color = $3,
          menu_subcategory_text_color = $4,
          mobile_sidebar_bg_color = $5,
          mobile_sidebar_text_color = $6,
          custom_seals = $7::jsonb,
          menu_display_style = $8
        WHERE id = $9`,
      [...colors, JSON.stringify(seals), style, barId],
    );
  } catch (error) {
    if (error.code !== '42703') throw error;
    await pool.query(
      `UPDATE bars SET
          menu_category_bg_color = $1,
          menu_category_text_color = $2,
          menu_subcategory_bg_color = $3,
          menu_subcategory_text_color = $4,
          mobile_sidebar_bg_color = $5,
          mobile_sidebar_text_color = $6,
          custom_seals = $7::jsonb
        WHERE id = $8`,
      [...colors, JSON.stringify(seals), barId],
    );
  }
  return {
    menuCategoryBgColor: colors[0] || '',
    menuCategoryTextColor: colors[1] || '',
    menuSubcategoryBgColor: colors[2] || '',
    menuSubcategoryTextColor: colors[3] || '',
    mobileSidebarBgColor: colors[4] || '',
    mobileSidebarTextColor: colors[5] || '',
    menuDisplayStyle: style,
    customSeals: seals,
  };
}

module.exports = {
  listMenuHouses,
  updateMenuHouseSettings,
  assertSitioIlhaConfigAccess,
  isSitioIlhaBar,
  canViewSitioIlhaConfig,
};

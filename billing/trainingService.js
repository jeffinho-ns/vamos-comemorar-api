'use strict';

const { resolveEntitlements } = require('../tenancy/entitlements');

async function listTrainingMaterials(pool, { organizationId, moduleKey, publishedOnly } = {}) {
  const params = [];
  let where = 'WHERE 1=1';

  if (organizationId) {
    params.push(Number(organizationId));
    where += ` AND (tm.organization_id IS NULL OR tm.organization_id = $${params.length})`;
  }
  if (moduleKey) {
    params.push(moduleKey);
    where += ` AND (tm.module_key IS NULL OR tm.module_key = $${params.length})`;
  }
  if (publishedOnly) {
    where += ` AND tm.is_published = TRUE`;
  }

  const { rows } = await pool.query(
    `SELECT tm.*, o.name AS organization_name
       FROM meu_backup_db.training_materials tm
       LEFT JOIN meu_backup_db.organizations o ON o.id = tm.organization_id
      ${where}
      ORDER BY tm.sort_order ASC, tm.created_at DESC`,
    params,
  );
  return rows;
}

async function createTrainingMaterial(pool, data, actorUserId) {
  const {
    title,
    description,
    contentType = 'link',
    url,
    moduleKey,
    planKey,
    organizationId,
    isPublished = true,
    sortOrder = 0,
  } = data;

  if (!title) throw new Error('Título é obrigatório.');

  const { rows } = await pool.query(
    `INSERT INTO meu_backup_db.training_materials
       (title, description, content_type, url, module_key, plan_key, organization_id, is_published, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      title,
      description || null,
      contentType,
      url || null,
      moduleKey || null,
      planKey || null,
      organizationId || null,
      !!isPublished,
      Number(sortOrder) || 0,
    ],
  );

  return rows[0];
}

async function updateTrainingMaterial(pool, id, data) {
  const fields = [];
  const params = [];
  let i = 1;

  const map = {
    title: 'title',
    description: 'description',
    contentType: 'content_type',
    url: 'url',
    moduleKey: 'module_key',
    planKey: 'plan_key',
    organizationId: 'organization_id',
    isPublished: 'is_published',
    sortOrder: 'sort_order',
  };

  for (const [key, col] of Object.entries(map)) {
    if (data[key] !== undefined) {
      fields.push(`${col} = $${i++}`);
      params.push(data[key]);
    }
  }

  if (!fields.length) throw new Error('Nada para atualizar.');

  fields.push('updated_at = now()');
  params.push(id);

  const { rows } = await pool.query(
    `UPDATE meu_backup_db.training_materials SET ${fields.join(', ')}
      WHERE id = $${i} RETURNING *`,
    params,
  );
  if (!rows.length) throw new Error('Material não encontrado.');
  return rows[0];
}

async function deleteTrainingMaterial(pool, id) {
  const { rowCount } = await pool.query(
    `DELETE FROM meu_backup_db.training_materials WHERE id = $1`,
    [id],
  );
  if (!rowCount) throw new Error('Material não encontrado.');
}

/**
 * Materiais visíveis ao cliente logado (plano + módulos + org).
 */
async function listTrainingMaterialsForUser(pool, user) {
  const entitlements = await resolveEntitlements(pool, user);
  if (entitlements.billingBlocked) return [];

  const orgId = entitlements.organizationId;
  if (!orgId && !entitlements.allowAll) return [];

  let planKey = null;
  let moduleKeys = entitlements.modules || [];

  if (orgId) {
    try {
      const planRes = await pool.query(
        `SELECT p.key AS plan_key
           FROM meu_backup_db.subscriptions s
           JOIN meu_backup_db.plans p ON p.id = s.plan_id
          WHERE s.organization_id = $1
          ORDER BY s.id DESC LIMIT 1`,
        [orgId],
      );
      planKey = planRes.rows[0]?.plan_key || null;
    } catch (_) {
      planKey = null;
    }
  }

  if (entitlements.allowAll) {
    return listTrainingMaterials(pool, { publishedOnly: true });
  }

  const params = [orgId, moduleKeys.length ? moduleKeys : ['__none__'], planKey];
  const { rows } = await pool.query(
    `SELECT tm.id, tm.title, tm.description, tm.content_type, tm.url,
            tm.module_key, tm.plan_key, tm.sort_order, tm.created_at
       FROM meu_backup_db.training_materials tm
      WHERE tm.is_published = TRUE
        AND (tm.organization_id IS NULL OR tm.organization_id = $1)
        AND (tm.plan_key IS NULL OR tm.plan_key = $4 OR $4 IS NULL)
        AND (
          tm.module_key IS NULL
          OR tm.module_key = ANY($2::text[])
        )
      ORDER BY tm.sort_order ASC, tm.created_at DESC`,
    params,
  );
  return rows;
}

module.exports = {
  listTrainingMaterials,
  listTrainingMaterialsForUser,
  createTrainingMaterial,
  updateTrainingMaterial,
  deleteTrainingMaterial,
};

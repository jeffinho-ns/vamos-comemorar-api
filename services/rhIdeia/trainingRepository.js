'use strict';

/**
 * Ideia RH — repositório de treinamentos (adaptado do Justino360, filtro por organization_id).
 */
const {
  computeExpiresAt,
  progressRate,
  resolveAssignAction,
} = require('./trainingRules');

const TRAINING_COLUMNS = `
        t.id, t.organization_id, t.establishment_id, t.scope, t.title, t.description,
        t.role_key, t.content_url, t.content_body, t.validity_days, t.is_mandatory,
        t.is_active, t.created_by, t.created_at, t.updated_at`;

const ASSIGNMENT_COLUMNS = `
        ta.id, ta.training_id, ta.user_id, ta.status, ta.assigned_at, ta.due_at,
        ta.completed_at, ta.result, ta.expires_at`;

async function expireDueAssignments(pool, organizationId) {
  const result = await pool.query(
    `UPDATE iri_training_assignments ta
        SET status = 'vencido'
       FROM iri_trainings t
      WHERE t.id = ta.training_id
        AND t.organization_id = $1
        AND ta.status = 'concluido'
        AND ta.expires_at IS NOT NULL
        AND ta.expires_at <= NOW()`,
    [organizationId]
  );
  return result.rowCount || 0;
}

function withProgress(row) {
  return { ...row, completion_rate: progressRate(row.assigned_count, row.completed_count) };
}

async function listTrainings(pool, { organizationId, establishmentFilter, roleKey, status, q, scope }) {
  const params = [organizationId];
  const where = ['t.organization_id = $1'];

  if (establishmentFilter) {
    params.push(establishmentFilter);
    where.push(`(t.establishment_id IS NULL OR t.establishment_id = $${params.length})`);
  }

  if (scope === 'archived') where.push('t.is_active = FALSE');
  else if (scope !== 'all') where.push('t.is_active = TRUE');

  if (roleKey) {
    params.push(roleKey);
    where.push(`(t.role_key = $${params.length} OR t.role_key IS NULL)`);
  }
  if (status) {
    params.push(status);
    where.push(`EXISTS (
      SELECT 1 FROM iri_training_assignments ta
       WHERE ta.training_id = t.id AND ta.status = $${params.length}
    )`);
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(t.title ILIKE $${params.length} OR t.description ILIKE $${params.length})`);
  }

  const result = await pool.query(
    `SELECT ${TRAINING_COLUMNS},
            u.name AS created_by_name,
            agg.assigned_count, agg.completed_count, agg.pending_count, agg.expired_count
       FROM iri_trainings t
       LEFT JOIN users u ON u.id = t.created_by
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS assigned_count,
                COUNT(*) FILTER (WHERE ta.status = 'concluido')::int AS completed_count,
                COUNT(*) FILTER (WHERE ta.status IN ('pendente','em_andamento'))::int AS pending_count,
                COUNT(*) FILTER (WHERE ta.status = 'vencido')::int AS expired_count
           FROM iri_training_assignments ta
          WHERE ta.training_id = t.id
       ) agg ON TRUE
      WHERE ${where.join(' AND ')}
      ORDER BY t.is_active DESC, t.is_mandatory DESC, t.title
      LIMIT 300`,
    params
  );
  return result.rows.map(withProgress);
}

async function getTraining(pool, { organizationId, id }) {
  const result = await pool.query(
    `SELECT ${TRAINING_COLUMNS}, u.name AS created_by_name
       FROM iri_trainings t
       LEFT JOIN users u ON u.id = t.created_by
      WHERE t.id = $1 AND t.organization_id = $2`,
    [id, organizationId]
  );
  return result.rows[0] || null;
}

async function listAssignments(pool, trainingId) {
  const result = await pool.query(
    `SELECT ${ASSIGNMENT_COLUMNS},
            u.name AS user_name, u.email AS user_email
       FROM iri_training_assignments ta
       LEFT JOIN users u ON u.id = ta.user_id
      WHERE ta.training_id = $1
      ORDER BY (ta.status = 'concluido'), u.name NULLS LAST
      LIMIT 500`,
    [trainingId]
  );
  return result.rows;
}

async function listTeam(pool, { organizationId, establishmentId, trainingId }) {
  const params = [organizationId, trainingId || null];
  let estFilter = '';
  if (establishmentId) {
    params.push(establishmentId);
    estFilter = ` AND p.establishment_id = $${params.length}`;
  }

  const result = await pool.query(
    `SELECT team.* FROM (
       SELECT DISTINCT ON (u.id)
              u.id, u.name, u.email, u.role, p.establishment_id,
              ta.id AS assignment_id, ta.status AS assignment_status,
              ta.due_at, ta.completed_at, ta.expires_at
         FROM user_establishment_permissions p
         JOIN establishments e ON e.id = p.establishment_id
         JOIN users u ON u.id = p.user_id
         LEFT JOIN iri_training_assignments ta
           ON ta.user_id = u.id AND ta.training_id = $2::int
        WHERE e.organization_id = $1
          AND p.is_active = TRUE
          AND p.user_id IS NOT NULL
          AND (p.can_access_rh_ideia = TRUE OR p.can_manage_rh_ideia = TRUE)${estFilter}
        ORDER BY u.id
     ) team
     ORDER BY team.name NULLS LAST
     LIMIT 500`,
    params
  );
  return result.rows;
}

async function filterEligibleUserIds(client, { organizationId, establishmentId, userIds }) {
  if (userIds.length === 0) return [];
  const params = [organizationId, userIds];
  let estFilter = '';
  if (establishmentId) {
    params.push(establishmentId);
    estFilter = ` AND p.establishment_id = $${params.length}`;
  }
  const result = await client.query(
    `SELECT DISTINCT p.user_id
       FROM user_establishment_permissions p
       JOIN establishments e ON e.id = p.establishment_id
      WHERE e.organization_id = $1
        AND p.is_active = TRUE
        AND p.user_id = ANY($2::int[])
        AND (p.can_access_rh_ideia = TRUE OR p.can_manage_rh_ideia = TRUE)${estFilter}`,
    params
  );
  return result.rows.map((row) => row.user_id);
}

async function insertTraining(pool, training) {
  const result = await pool.query(
    `INSERT INTO iri_trainings
      (organization_id, establishment_id, scope, title, description, role_key,
       content_url, content_body, validity_days, is_mandatory, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      training.organizationId,
      training.establishmentId,
      training.scope,
      training.title,
      training.description,
      training.roleKey,
      training.contentUrl,
      training.contentBody,
      training.validityDays,
      training.isMandatory,
      training.createdBy,
    ]
  );
  return result.rows[0];
}

async function updateTraining(pool, { organizationId, id, sets, params }) {
  const result = await pool.query(
    `UPDATE iri_trainings
        SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $${params.length + 1} AND organization_id = $${params.length + 2}
      RETURNING *`,
    [...params, id, organizationId]
  );
  return result.rows[0] || null;
}

async function assignUsers(
  pool,
  { organizationId, establishmentId, trainingId, userIds, dueAt, force, now = new Date() }
) {
  const client = await pool.connect();
  let inTransaction = false;
  try {
    await client.query('BEGIN');
    inTransaction = true;

    const eligible = await filterEligibleUserIds(client, { organizationId, establishmentId, userIds });
    const skipped = userIds.filter((id) => !eligible.includes(id));

    const existingQuery = await client.query(
      `SELECT ${ASSIGNMENT_COLUMNS}
         FROM iri_training_assignments ta
        WHERE ta.training_id = $1 AND ta.user_id = ANY($2::int[])
        FOR UPDATE`,
      [trainingId, eligible.length ? eligible : [0]]
    );
    const existingByUser = new Map(existingQuery.rows.map((row) => [row.user_id, row]));

    const toCreate = [];
    const toReset = [];
    const kept = [];
    for (const userId of eligible) {
      const existing = existingByUser.get(userId) || null;
      const action = resolveAssignAction(existing, { force, now });
      if (action === 'create') toCreate.push(userId);
      else if (action === 'reset') toReset.push(existing.id);
      else kept.push(existing);
    }

    const rows = [...kept];
    if (toCreate.length) {
      const created = await client.query(
        `INSERT INTO iri_training_assignments (training_id, user_id, due_at, status)
         SELECT $1, uid, $3::timestamptz, 'pendente'
           FROM unnest($2::int[]) AS uid
         RETURNING *`,
        [trainingId, toCreate, dueAt]
      );
      rows.push(...created.rows);
    }
    if (toReset.length) {
      const reset = await client.query(
        `UPDATE iri_training_assignments
            SET status = 'pendente', assigned_at = NOW(),
                due_at = COALESCE($2::timestamptz, due_at),
                completed_at = NULL, result = NULL, expires_at = NULL
          WHERE id = ANY($1::int[])
          RETURNING *`,
        [toReset, dueAt]
      );
      rows.push(...reset.rows);
    }

    await client.query('COMMIT');
    inTransaction = false;
    return { rows, created: toCreate.length, reset: toReset.length, kept: kept.length, skipped };
  } catch (err) {
    if (inTransaction) await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function completeAssignment(pool, { trainingId, userId, result, validityDays }) {
  const expiresAt = computeExpiresAt(new Date(), validityDays);
  const inserted = await pool.query(
    `INSERT INTO iri_training_assignments
       (training_id, user_id, status, completed_at, result, expires_at)
     VALUES ($1,$2,'concluido', NOW(), $3, $4::timestamptz)
     ON CONFLICT (training_id, user_id) DO UPDATE
        SET status = 'concluido', completed_at = NOW(),
            result = EXCLUDED.result, expires_at = EXCLUDED.expires_at
     RETURNING *`,
    [trainingId, userId, result, expiresAt ? expiresAt.toISOString() : null]
  );
  return inserted.rows[0];
}

async function startAssignment(pool, { trainingId, userId }) {
  const result = await pool.query(
    `INSERT INTO iri_training_assignments (training_id, user_id, status)
     VALUES ($1,$2,'em_andamento')
     ON CONFLICT (training_id, user_id) DO UPDATE
        SET status = CASE
              WHEN iri_training_assignments.status IN ('pendente','vencido') THEN 'em_andamento'
              ELSE iri_training_assignments.status
            END
     RETURNING *`,
    [trainingId, userId]
  );
  return result.rows[0];
}

async function listMyTrainings(pool, { organizationId, userId, userEstablishmentIds, status }) {
  const params = [organizationId, userId];
  const where = [
    't.organization_id = $1',
    'ta.user_id = $2',
    't.is_active = TRUE',
    `(t.establishment_id IS NULL OR t.establishment_id = ANY($3::int[]))`,
  ];
  params.push(userEstablishmentIds.length ? userEstablishmentIds : [0]);

  if (status) {
    params.push(status);
    where.push(`ta.status = $${params.length}`);
  }

  const result = await pool.query(
    `SELECT ${ASSIGNMENT_COLUMNS},
            t.title, t.description, t.content_url, t.content_body,
            t.is_mandatory, t.role_key, t.validity_days, t.establishment_id, t.scope
       FROM iri_training_assignments ta
       JOIN iri_trainings t ON t.id = ta.training_id
      WHERE ${where.join(' AND ')}
      ORDER BY (ta.status = 'concluido'), ta.due_at NULLS LAST, t.title
      LIMIT 200`,
    params
  );
  return result.rows;
}

/** Atribuir todos os elegíveis da org ou de uma unidade. */
async function assignAllEligible(pool, { organizationId, establishmentId, trainingId, dueAt, force }) {
  const team = await listTeam(pool, { organizationId, establishmentId, trainingId });
  const userIds = team.map((t) => t.id);
  return assignUsers(pool, { organizationId, establishmentId, trainingId, userIds, dueAt, force });
}

module.exports = {
  expireDueAssignments,
  listTrainings,
  getTraining,
  listAssignments,
  listTeam,
  insertTraining,
  updateTraining,
  assignUsers,
  assignAllEligible,
  completeAssignment,
  startAssignment,
  listMyTrainings,
};

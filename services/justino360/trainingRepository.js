'use strict';

/**
 * Justino360 — acesso a dados de treinamentos e atribuições.
 * Todas as consultas são parametrizadas e sempre filtram por
 * `establishment_id` para não vazar dados entre casas.
 */

const {
  computeExpiresAt,
  progressRate,
  resolveAssignAction,
} = require('./trainingRules');

const TRAINING_COLUMNS = `
        t.id, t.establishment_id, t.title, t.description, t.role_key,
        t.content_url, t.content_body, t.validity_days, t.is_mandatory,
        t.is_active, t.created_by, t.created_at, t.updated_at`;

const ASSIGNMENT_COLUMNS = `
        ta.id, ta.training_id, ta.user_id, ta.status, ta.assigned_at, ta.due_at,
        ta.completed_at, ta.result, ta.expires_at`;

/**
 * Varredura de reciclagem: conclusão com `expires_at` no passado volta a cobrar
 * a pessoa como `vencido`. Roda antes das listagens — barata e idempotente.
 */
async function expireDueAssignments(pool, establishmentId) {
  const result = await pool.query(
    `UPDATE j360_training_assignments ta
        SET status = 'vencido'
       FROM j360_trainings t
      WHERE t.id = ta.training_id
        AND t.establishment_id = $1
        AND ta.status = 'concluido'
        AND ta.expires_at IS NOT NULL
        AND ta.expires_at <= NOW()`,
    [establishmentId]
  );
  return result.rowCount || 0;
}

function withProgress(row) {
  return {
    ...row,
    completion_rate: progressRate(row.assigned_count, row.completed_count),
  };
}

/**
 * Lista cursos com o agregado de progresso.
 * Filtros: `roleKey` (traz também os cursos gerais), `status` (cursos que têm
 * ao menos uma atribuição naquela situação), `q` (título/descrição) e
 * `scope` = active (padrão) | archived | all.
 */
async function listTrainings(pool, { establishmentId, roleKey, status, q, scope }) {
  const params = [establishmentId];
  const where = ['t.establishment_id = $1'];

  if (scope === 'archived') where.push('t.is_active = FALSE');
  else if (scope !== 'all') where.push('t.is_active = TRUE');

  if (roleKey) {
    params.push(roleKey);
    where.push(`(t.role_key = $${params.length} OR t.role_key IS NULL)`);
  }
  if (status) {
    params.push(status);
    where.push(`EXISTS (
      SELECT 1 FROM j360_training_assignments ta
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
       FROM j360_trainings t
       LEFT JOIN users u ON u.id = t.created_by
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS assigned_count,
                COUNT(*) FILTER (WHERE ta.status = 'concluido')::int AS completed_count,
                COUNT(*) FILTER (WHERE ta.status IN ('pendente','em_andamento'))::int AS pending_count,
                COUNT(*) FILTER (WHERE ta.status = 'vencido')::int AS expired_count
           FROM j360_training_assignments ta
          WHERE ta.training_id = t.id
       ) agg ON TRUE
      WHERE ${where.join(' AND ')}
      ORDER BY t.is_active DESC, t.is_mandatory DESC, t.title
      LIMIT 300`,
    params
  );
  return result.rows.map(withProgress);
}

async function getTraining(pool, { establishmentId, id }) {
  const result = await pool.query(
    `SELECT ${TRAINING_COLUMNS}, u.name AS created_by_name
       FROM j360_trainings t
       LEFT JOIN users u ON u.id = t.created_by
      WHERE t.id = $1 AND t.establishment_id = $2`,
    [id, establishmentId]
  );
  return result.rows[0] || null;
}

/** Quem está atribuído a um curso e em que situação — visão de gestão. */
async function listAssignments(pool, trainingId) {
  const result = await pool.query(
    `SELECT ${ASSIGNMENT_COLUMNS},
            u.name AS user_name, u.email AS user_email
       FROM j360_training_assignments ta
       LEFT JOIN users u ON u.id = ta.user_id
      WHERE ta.training_id = $1
      ORDER BY (ta.status = 'concluido'), u.name NULLS LAST
      LIMIT 500`,
    [trainingId]
  );
  return result.rows;
}

/**
 * Equipe elegível para atribuição: quem tem UEP ativa no estabelecimento.
 * Com `trainingId`, já devolve a situação atual da pessoa naquele curso.
 */
async function listTeam(pool, { establishmentId, trainingId }) {
  const result = await pool.query(
    `SELECT team.* FROM (
       SELECT DISTINCT ON (u.id)
              u.id, u.name, u.email, u.role,
              ta.id AS assignment_id, ta.status AS assignment_status,
              ta.due_at, ta.completed_at, ta.expires_at
         FROM user_establishment_permissions p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN j360_training_assignments ta
           ON ta.user_id = u.id AND ta.training_id = $2::int
        WHERE p.establishment_id = $1
          AND p.is_active = TRUE
          AND p.user_id IS NOT NULL
          AND (p.can_access_justino360 = TRUE OR p.can_manage_justino360 = TRUE)
        ORDER BY u.id
     ) team
     ORDER BY team.name NULLS LAST
     LIMIT 500`,
    [establishmentId, trainingId || null]
  );
  return result.rows;
}

/**
 * Ids que realmente pertencem à casa e conseguem abrir o módulo — evita
 * atribuir curso para gente de fora ou para quem nunca veria a tarefa.
 * Mesma condição de `listTeam`.
 */
async function filterEligibleUserIds(client, { establishmentId, userIds }) {
  if (userIds.length === 0) return [];
  const result = await client.query(
    `SELECT DISTINCT p.user_id
       FROM user_establishment_permissions p
      WHERE p.establishment_id = $1
        AND p.is_active = TRUE
        AND p.user_id = ANY($2::int[])
        AND (p.can_access_justino360 = TRUE OR p.can_manage_justino360 = TRUE)`,
    [establishmentId, userIds]
  );
  return result.rows.map((row) => row.user_id);
}

async function insertTraining(pool, training) {
  const result = await pool.query(
    `INSERT INTO j360_trainings
      (establishment_id, title, description, role_key, content_url, content_body,
       validity_days, is_mandatory, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      training.establishmentId,
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

async function updateTraining(pool, { establishmentId, id, sets, params }) {
  const result = await pool.query(
    `UPDATE j360_trainings
        SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $${params.length + 1} AND establishment_id = $${params.length + 2}
      RETURNING *`,
    [...params, id, establishmentId]
  );
  return result.rows[0] || null;
}

/**
 * Atribuição em lote numa transação. Conclusão ainda válida é preservada
 * (`keep`); pendente/vencida volta para `pendente` com o histórico do ciclo
 * anterior limpo. `force` recicla todo mundo, inclusive quem está em dia.
 */
async function assignUsers(
  pool,
  { establishmentId, trainingId, userIds, dueAt, force, now = new Date() }
) {
  const client = await pool.connect();
  let inTransaction = false;
  try {
    await client.query('BEGIN');
    inTransaction = true;

    const eligible = await filterEligibleUserIds(client, { establishmentId, userIds });
    const skipped = userIds.filter((id) => !eligible.includes(id));

    const existingQuery = await client.query(
      `SELECT ${ASSIGNMENT_COLUMNS}
         FROM j360_training_assignments ta
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
        `INSERT INTO j360_training_assignments (training_id, user_id, due_at, status)
         SELECT $1, uid, $3::timestamptz, 'pendente'
           FROM unnest($2::int[]) AS uid
         RETURNING *`,
        [trainingId, toCreate, dueAt]
      );
      rows.push(...created.rows);
    }
    if (toReset.length) {
      const reset = await client.query(
        `UPDATE j360_training_assignments
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
    return {
      rows,
      created: toCreate.length,
      reset: toReset.length,
      kept: kept.length,
      skipped,
    };
  } catch (err) {
    if (inTransaction) await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Marca conclusão e já calcula a próxima reciclagem a partir de `validity_days`.
 * Quem não tinha atribuição (curso aberto por função) passa a ter.
 */
async function completeAssignment(pool, { trainingId, userId, result, validityDays }) {
  const expiresAt = computeExpiresAt(new Date(), validityDays);
  const inserted = await pool.query(
    `INSERT INTO j360_training_assignments
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

/** Abrir o conteúdo tira a atribuição de `pendente`/`vencido`. */
async function startAssignment(pool, { trainingId, userId }) {
  const result = await pool.query(
    `INSERT INTO j360_training_assignments (training_id, user_id, status)
     VALUES ($1,$2,'em_andamento')
     ON CONFLICT (training_id, user_id) DO UPDATE
        SET status = CASE
              WHEN j360_training_assignments.status IN ('pendente','vencido') THEN 'em_andamento'
              ELSE j360_training_assignments.status
            END
     RETURNING *`,
    [trainingId, userId]
  );
  return result.rows[0];
}

/** Meus treinamentos — só cursos ativos, com o conteúdo para abrir na hora. */
async function listMyTrainings(pool, { establishmentId, userId, status }) {
  const params = [establishmentId, userId];
  let statusFilter = '';
  if (status) {
    params.push(status);
    statusFilter = ` AND ta.status = $${params.length}`;
  }
  const result = await pool.query(
    `SELECT ${ASSIGNMENT_COLUMNS},
            t.title, t.description, t.content_url, t.content_body,
            t.is_mandatory, t.role_key, t.validity_days
       FROM j360_training_assignments ta
       JOIN j360_trainings t ON t.id = ta.training_id
      WHERE t.establishment_id = $1 AND ta.user_id = $2 AND t.is_active = TRUE${statusFilter}
      ORDER BY (ta.status = 'concluido'), ta.due_at NULLS LAST, t.title
      LIMIT 200`,
    params
  );
  return result.rows;
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
  completeAssignment,
  startAssignment,
  listMyTrainings,
};

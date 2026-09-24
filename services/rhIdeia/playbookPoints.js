'use strict';

const POINTS = {
  prova: 10,
  checklist: 5,
  checklist_lider: 2,
  avaliacao: 8,
  padrinho: 5,
  treino: 3,
  ronda: 3,
  abertura: 2,
  fechamento: 2,
};

async function awardOnce(pool, entry) {
  const inserted = await pool.query(
    `INSERT INTO iri_point_ledger
      (organization_id, establishment_id, user_id, source, points, evidence_type, evidence_id, note, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::timestamptz, NOW()))
     ON CONFLICT (organization_id, user_id, source, evidence_type, evidence_id) DO NOTHING
     RETURNING id, points`,
    [
      entry.organizationId,
      entry.establishmentId || null,
      entry.userId,
      entry.source,
      entry.points,
      entry.evidenceType || null,
      entry.evidenceId || null,
      entry.note || null,
      entry.createdBy || null,
      entry.createdAt || null,
    ]
  );
  return inserted.rows[0] || null;
}

module.exports = {
  POINTS,
  awardOnce,
};

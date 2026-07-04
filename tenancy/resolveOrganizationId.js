'use strict';

/**
 * Resolve organization_id canônico a partir do establishment_id operacional (place/bar).
 */

async function resolveOrganizationIdForEstablishment(pool, establishmentId) {
  const estId = Number(establishmentId);
  if (!Number.isFinite(estId) || estId <= 0) return null;

  const { rows } = await pool.query(
    `SELECT organization_id
       FROM establishments
      WHERE legacy_place_id = $1 OR legacy_bar_id = $1
      ORDER BY id
      LIMIT 1`,
    [estId],
  );

  const orgId = rows[0]?.organization_id;
  return orgId != null ? Number(orgId) : null;
}

/** Org do JWT ou org piloto (single-tenant legado). */
async function resolveOrganizationIdForUser(pool, user) {
  const fromToken = Number(user?.organization_id);
  if (Number.isFinite(fromToken) && fromToken > 0) return fromToken;

  const { rows } = await pool.query(
    `SELECT id FROM organizations WHERE slug = 'grupo-ideia-um' LIMIT 1`,
  );
  const orgId = rows[0]?.id;
  return orgId != null ? Number(orgId) : null;
}

module.exports = {
  resolveOrganizationIdForEstablishment,
  resolveOrganizationIdForUser,
};

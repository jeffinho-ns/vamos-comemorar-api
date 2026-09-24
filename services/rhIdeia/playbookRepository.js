'use strict';

const { PLAYBOOK_VERSION, isLeaderRole } = require('./playbookRoles');
const { canReadChapter, resolvePlaybookScope } = require('./playbookAccess');
const { seedPlaybook } = require('./playbookSeed');

const CHAPTER_PUBLIC = `
  c.id, c.establishment_id, c.slug, c.part, c.audience, c.visible_roles,
  c.title, c.body, c.version, c.sort_order, c.is_current`;

async function loadProfile(pool, organizationId, userId) {
  const { rows } = await pool.query(
    `SELECT p.id, p.organization_id, p.user_id, p.establishment_id, p.sector_id, p.role_key,
            s.key AS sector_key, s.name AS sector_name, u.name AS user_name
       FROM iri_employee_profiles p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN iri_sectors s ON s.id = p.sector_id
      WHERE p.organization_id = $1 AND p.user_id = $2`,
    [organizationId, userId]
  );
  return rows[0] || null;
}

async function listCurrentChapters(pool, organizationId) {
  const { rows } = await pool.query(
    `SELECT ${CHAPTER_PUBLIC}
       FROM iri_playbook_chapters c
      WHERE c.organization_id = $1 AND c.is_current = TRUE AND c.version = $2
      ORDER BY c.sort_order, c.id`,
    [organizationId, PLAYBOOK_VERSION]
  );
  return rows;
}

function visibleChapters(chapters, { seesAll, profile }) {
  return chapters.filter((chapter) => canReadChapter({ seesAll, profile, chapter }));
}

async function readIdsForUser(pool, userId) {
  const { rows } = await pool.query(
    `SELECT chapter_id FROM iri_playbook_reads WHERE user_id = $1 AND version = $2`,
    [userId, PLAYBOOK_VERSION]
  );
  return new Set(rows.map((row) => row.chapter_id));
}

async function hasTerm(pool, organizationId, userId) {
  const { rows } = await pool.query(
    `SELECT id FROM iri_playbook_terms
      WHERE organization_id = $1 AND user_id = $2 AND version = $3`,
    [organizationId, userId, PLAYBOOK_VERSION]
  );
  return Boolean(rows[0]);
}

async function bestAttempt(pool, userId) {
  const { rows } = await pool.query(
    `SELECT score, total, passed
       FROM iri_playbook_attempts
      WHERE user_id = $1 AND version = $2
      ORDER BY passed DESC, score DESC, id DESC
      LIMIT 1`,
    [userId, PLAYBOOK_VERSION]
  );
  return rows[0] || null;
}

async function buildStatus(pool, { organizationId, userId, seesAll, profile, chapters }) {
  if (!profile && !seesAll) {
    return {
      blocked: true,
      reason: 'sem_ficha',
      version: PLAYBOOK_VERSION,
      profile: null,
      is_leader: false,
      sees_all: false,
    };
  }

  const mine = visibleChapters(chapters, { seesAll: false, profile });
  const required = profile ? mine : [];
  const reads = profile ? await readIdsForUser(pool, userId) : new Set();
  const pending = required.filter((chapter) => !reads.has(chapter.id));
  const termOk = profile ? await hasTerm(pool, organizationId, userId) : false;
  const attempt = profile ? await bestAttempt(pool, userId) : null;
  const quizPassed = Boolean(attempt?.passed);
  const blocked = Boolean(profile) && !seesAll && (pending.length > 0 || !termOk || !quizPassed);

  return {
    blocked,
    reason: blocked ? 'manual_pendente' : null,
    version: PLAYBOOK_VERSION,
    profile,
    is_leader: Boolean(profile && isLeaderRole(profile.role_key)),
    sees_all: Boolean(seesAll),
    chapters_required: required.length,
    chapters_read: required.length - pending.length,
    term_accepted: termOk,
    quiz_passed: quizPassed,
    quiz_score: attempt ? attempt.score : null,
    quiz_total: attempt ? attempt.total : null,
  };
}

async function loadContext(pool, req) {
  const userId = req.user.id || req.user.userId;
  const organizationId = req.iriOrganizationId;
  let chapters = await listCurrentChapters(pool, organizationId);
  if (chapters.length === 0) {
    const seeded = await seedPlaybook(pool, organizationId);
    if (seeded.ok) chapters = await listCurrentChapters(pool, organizationId);
  }
  const profile = await loadProfile(pool, organizationId, userId);
  const scope = resolvePlaybookScope({
    isSuperAdmin: req.user?.is_super_admin === true,
    userRole: req.user?.role,
    profile,
  });
  return { userId, organizationId, chapters, profile, scope };
}

module.exports = {
  loadContext,
  CHAPTER_PUBLIC,
  loadProfile,
  listCurrentChapters,
  visibleChapters,
  readIdsForUser,
  hasTerm,
  bestAttempt,
  buildStatus,
};

'use strict';

const { PLAYBOOK_VERSION, findRole } = require('./playbookRoles');
const { allChapters, CHECKLISTS } = require('./playbookContent');
const { QUIZ_BANK } = require('./playbookQuizBank');

async function resolveJustinoEstablishment(pool, organizationId) {
  const { rows } = await pool.query(
    `SELECT id
       FROM establishments
      WHERE organization_id = $1
        AND (legacy_place_id = 1 OR slug ILIKE '%justino%')
      ORDER BY (legacy_place_id = 1) DESC, id
      LIMIT 1`,
    [organizationId]
  );
  return rows[0]?.id || null;
}

async function upsertChapter(pool, organizationId, establishmentId, chapter) {
  await pool.query(
    `INSERT INTO iri_playbook_chapters
      (organization_id, establishment_id, slug, part, audience, visible_roles, title, body, version, sort_order, is_current)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
     ON CONFLICT (organization_id, slug, version)
     DO UPDATE SET
       establishment_id = EXCLUDED.establishment_id,
       part = EXCLUDED.part,
       audience = EXCLUDED.audience,
       visible_roles = EXCLUDED.visible_roles,
       title = EXCLUDED.title,
       body = EXCLUDED.body,
       sort_order = EXCLUDED.sort_order,
       is_current = TRUE,
       updated_at = NOW()`,
    [
      organizationId,
      establishmentId,
      chapter.slug,
      chapter.part,
      chapter.audience,
      chapter.visible_roles || [],
      chapter.title,
      chapter.body,
      PLAYBOOK_VERSION,
      chapter.sort,
    ]
  );
}

async function upsertQuestion(pool, organizationId, establishmentId, question, index) {
  const saved = await pool.query(
    `INSERT INTO iri_playbook_questions
      (organization_id, establishment_id, slug, sort_order, prompt, options, version)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
     ON CONFLICT (organization_id, slug, version)
     DO UPDATE SET
       establishment_id = EXCLUDED.establishment_id,
       sort_order = EXCLUDED.sort_order,
       prompt = EXCLUDED.prompt,
       options = EXCLUDED.options
     RETURNING id`,
    [
      organizationId,
      establishmentId,
      question.slug,
      index + 1,
      question.prompt,
      JSON.stringify(question.options),
      PLAYBOOK_VERSION,
    ]
  );
  await pool.query(
    `INSERT INTO iri_playbook_answer_keys (question_id, correct_index)
     VALUES ($1, $2)
     ON CONFLICT (question_id) DO UPDATE SET correct_index = EXCLUDED.correct_index`,
    [saved.rows[0].id, question.correct]
  );
}

async function upsertChecklist(pool, organizationId, establishmentId, roleKey, labels) {
  const role = findRole(roleKey);
  const saved = await pool.query(
    `INSERT INTO iri_playbook_checklists
      (organization_id, establishment_id, role_key, title, version)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (organization_id, establishment_id, role_key, version)
     DO UPDATE SET title = EXCLUDED.title
     RETURNING id`,
    [organizationId, establishmentId, roleKey, `Checklist · ${role.label}`, PLAYBOOK_VERSION]
  );
  const checklistId = saved.rows[0].id;
  await pool.query(`DELETE FROM iri_playbook_checklist_items WHERE checklist_id = $1`, [checklistId]);
  for (let i = 0; i < labels.length; i += 1) {
    await pool.query(
      `INSERT INTO iri_playbook_checklist_items (checklist_id, label, sort_order)
       VALUES ($1, $2, $3)`,
      [checklistId, labels[i], i + 1]
    );
  }
}

async function seedPlaybook(pool, organizationId) {
  const establishmentId = await resolveJustinoEstablishment(pool, organizationId);
  if (!establishmentId) {
    return { ok: false, message: 'Unidade Seu Justino não encontrada nesta organização.' };
  }

  const chapters = allChapters();
  for (const chapter of chapters) {
    await upsertChapter(pool, organizationId, establishmentId, chapter);
  }
  for (let i = 0; i < QUIZ_BANK.length; i += 1) {
    await upsertQuestion(pool, organizationId, establishmentId, QUIZ_BANK[i], i);
  }
  const roles = Object.keys(CHECKLISTS);
  for (const roleKey of roles) {
    await upsertChecklist(pool, organizationId, establishmentId, roleKey, CHECKLISTS[roleKey]);
  }

  return {
    ok: true,
    establishmentId,
    chapters: chapters.length,
    questions: QUIZ_BANK.length,
  };
}

module.exports = {
  resolveJustinoEstablishment,
  seedPlaybook,
};

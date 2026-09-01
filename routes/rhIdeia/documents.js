'use strict';

const express = require('express');
const { applyCommonMiddleware, requireManage, writeAudit } = require('./middleware');
const { buildVisibilityClause, applyVisibilityToWhere } = require('../../services/rhIdeia/scopeHelpers');
const {
  str,
  optionalStr,
  parseId,
  parseBoolean,
  pickScope,
  parseEstablishmentId,
  resolveScopeEstablishment,
} = require('../../validators/rhIdeiaValidator');
const { DOCUMENT_CATEGORIES, ROLE_KEYS } = require('../../services/rhIdeia/constants');

const DOC_COLUMNS = `
        d.id, d.organization_id, d.establishment_id, d.scope, d.sector_id,
        d.category, d.role_key, d.title, d.description, d.file_url,
        d.version, d.is_current, d.replaces_id, d.uploaded_by,
        d.created_at, d.updated_at`;

function pickCategory(value, fallback) {
  if (value === undefined || value === null || value === '') return { ok: true, value: fallback };
  const v = String(value).trim().toLowerCase();
  if (!DOCUMENT_CATEGORIES.includes(v)) return { ok: false, value: null };
  return { ok: true, value: v };
}

function pickRoleKey(value) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  const v = String(value).trim().toLowerCase();
  if (!ROLE_KEYS.includes(v)) return { ok: false, value: null };
  return { ok: true, value: v };
}

const INVALID_CATEGORY = `Categoria inválida. Use uma de: ${DOCUMENT_CATEGORIES.join(', ')}.`;
const INVALID_ROLE = `Função inválida. Use uma de: ${ROLE_KEYS.join(', ')}.`;

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  router.get('/documents', async (req, res) => {
    const orgId = req.iriOrganizationId;
    const scope = String(req.query.scope || 'current').trim().toLowerCase();

    const vis = buildVisibilityClause({
      alias: 'd',
      orgParamIndex: 1,
      userEstablishmentIds: req.iriUserEstablishmentIds,
      manageAll: req.iriCanManage,
    });
    const params = [orgId];
    const where = applyVisibilityToWhere([], vis, params);

    if (scope === 'archived') where.push('d.is_current = FALSE');
    else if (scope !== 'all') where.push('d.is_current = TRUE');

    const category = pickCategory(req.query.category, null);
    if (!category.ok) return res.status(400).json({ success: false, message: INVALID_CATEGORY });
    if (category.value) {
      params.push(category.value);
      where.push(`d.category = $${params.length}`);
    }

    const roleKey = pickRoleKey(req.query.role_key);
    if (!roleKey.ok) return res.status(400).json({ success: false, message: INVALID_ROLE });
    if (roleKey.value) {
      params.push(roleKey.value);
      where.push(`(d.role_key = $${params.length} OR d.role_key IS NULL)`);
    }

    const q = optionalStr(req.query.q, 200);
    if (q) {
      params.push(`%${q}%`);
      where.push(`(d.title ILIKE $${params.length} OR d.description ILIKE $${params.length})`);
    }

    try {
      const result = await pool.query(
        `SELECT ${DOC_COLUMNS},
                s.name AS sector_name,
                u.name AS uploaded_by_name
           FROM iri_documents d
           LEFT JOIN iri_sectors s ON s.id = d.sector_id
           LEFT JOIN users u ON u.id = d.uploaded_by
          WHERE ${where.join(' AND ')}
          ORDER BY d.category, d.title, d.version DESC
          LIMIT 500`,
        params
      );
      return res.json({
        success: true,
        data: result.rows,
        meta: { can_manage: req.iriCanManage, scope },
      });
    } catch (err) {
      console.error(`[iri] docs list organization_id=${orgId}:`, err.message);
      return res.status(500).json({ success: false, message: 'Falha ao listar documentos.' });
    }
  });

  router.post('/documents', requireManage, async (req, res) => {
    const title = str(req.body.title, 300);
    if (!title) return res.status(400).json({ success: false, message: 'Título obrigatório.' });

    const category = pickCategory(req.body.category, 'regulamento');
    if (!category.ok) return res.status(400).json({ success: false, message: INVALID_CATEGORY });

    const roleKey = pickRoleKey(req.body.role_key);
    if (!roleKey.ok) return res.status(400).json({ success: false, message: INVALID_ROLE });

    const scopePick = pickScope(req.body.scope, 'organization');
    if (!scopePick.ok) return res.status(400).json({ success: false, message: 'Escopo inválido.' });

    const establishmentId = resolveScopeEstablishment(
      scopePick.value,
      parseEstablishmentId(req.body.establishment_id)
    );
    if (scopePick.value === 'establishment' && !establishmentId) {
      return res.status(400).json({ success: false, message: 'establishment_id obrigatório para escopo de unidade.' });
    }

    const replacesId = parseId(req.body.replaces_id);
    const actorUserId = req.user.id || req.user.userId;
    const client = await pool.connect();
    let inTransaction = false;
    try {
      await client.query('BEGIN');
      inTransaction = true;

      let version = 1;
      if (replacesId) {
        const prev = await client.query(
          `SELECT id, version FROM iri_documents
            WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
          [replacesId, req.iriOrganizationId]
        );
        if (!prev.rows[0]) {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(404).json({ success: false, message: 'Versão anterior não encontrada.' });
        }
        version = (prev.rows[0].version || 0) + 1;
        await client.query(
          `UPDATE iri_documents SET is_current = FALSE, updated_at = NOW()
            WHERE id = $1 AND organization_id = $2`,
          [replacesId, req.iriOrganizationId]
        );
      }

      const result = await client.query(
        `INSERT INTO iri_documents
          (organization_id, establishment_id, scope, sector_id, category, role_key,
           title, description, file_url, version, is_current, replaces_id, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11,$12)
         RETURNING *`,
        [
          req.iriOrganizationId,
          establishmentId,
          scopePick.value,
          parseId(req.body.sector_id),
          category.value,
          roleKey.value,
          title,
          optionalStr(req.body.description, 4000),
          optionalStr(req.body.file_url, 1000),
          version,
          replacesId,
          actorUserId,
        ]
      );
      await client.query('COMMIT');
      inTransaction = false;

      await writeAudit(pool, {
        organizationId: req.iriOrganizationId,
        establishmentId,
        entityType: 'document',
        entityId: result.rows[0].id,
        action: replacesId ? 'new_version' : 'create',
        actorUserId,
      });
      return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      if (inTransaction) await client.query('ROLLBACK').catch(() => {});
      console.error(`[iri] docs create organization_id=${req.iriOrganizationId}:`, err.message);
      return res.status(500).json({ success: false, message: 'Falha ao salvar documento.' });
    } finally {
      client.release();
    }
  });

  router.get('/documents/:id/versions', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });
    try {
      const result = await pool.query(
        `WITH RECURSIVE chain AS (
           SELECT d.* FROM iri_documents d
            WHERE d.id = $1 AND d.organization_id = $2
           UNION
           SELECT d.* FROM iri_documents d
             JOIN chain c ON d.id = c.replaces_id OR d.replaces_id = c.id
            WHERE d.organization_id = $2
         )
         SELECT c.id, c.category, c.role_key, c.title, c.description, c.file_url,
                c.version, c.is_current, c.replaces_id, c.created_at, c.updated_at,
                u.name AS uploaded_by_name
           FROM chain c
           LEFT JOIN users u ON u.id = c.uploaded_by
          ORDER BY c.version DESC, c.id DESC`,
        [id, req.iriOrganizationId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Documento não encontrado.' });
      }
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error(`[iri] docs versions id=${id}:`, err.message);
      return res.status(500).json({ success: false, message: 'Falha ao carregar histórico.' });
    }
  });

  router.patch('/documents/:id', requireManage, async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });

    const sets = [];
    const params = [];
    const pushSet = (column, value) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };

    if (req.body.title !== undefined) {
      const title = str(req.body.title, 300);
      if (!title) return res.status(400).json({ success: false, message: 'Título obrigatório.' });
      pushSet('title', title);
    }
    if (req.body.description !== undefined) pushSet('description', optionalStr(req.body.description, 4000));
    if (req.body.file_url !== undefined) pushSet('file_url', optionalStr(req.body.file_url, 1000));
    if (req.body.category !== undefined) {
      const category = pickCategory(req.body.category, null);
      if (!category.ok || !category.value) {
        return res.status(400).json({ success: false, message: INVALID_CATEGORY });
      }
      pushSet('category', category.value);
    }
    if (req.body.is_current !== undefined) {
      pushSet('is_current', parseBoolean(req.body.is_current, true));
    }
    if (sets.length === 0) {
      return res.status(400).json({ success: false, message: 'Nenhum campo para atualizar.' });
    }

    params.push(id, req.iriOrganizationId);
    try {
      const result = await pool.query(
        `UPDATE iri_documents SET ${sets.join(', ')}, updated_at = NOW()
          WHERE id = $${params.length - 1} AND organization_id = $${params.length}
          RETURNING *`,
        params
      );
      if (!result.rows[0]) {
        return res.status(404).json({ success: false, message: 'Documento não encontrado.' });
      }
      await writeAudit(pool, {
        organizationId: req.iriOrganizationId,
        establishmentId: result.rows[0].establishment_id,
        entityType: 'document',
        entityId: id,
        action: 'update',
        actorUserId: req.user.id || req.user.userId,
      });
      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error(`[iri] docs update id=${id}:`, err.message);
      return res.status(500).json({ success: false, message: 'Falha ao atualizar documento.' });
    }
  });

  return router;
};

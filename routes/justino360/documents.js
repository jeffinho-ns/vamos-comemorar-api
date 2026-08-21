'use strict';

/**
 * Justino360 — Documentos versionados (POPs, manuais, procedimentos por função,
 * laudos/relatórios externos, atas e certificados).
 *
 * Versionamento: um novo documento pode declarar `replaces_id`. O antecessor
 * sai de circulação (is_current = FALSE) e a nova versão nasce com version + 1.
 * Assim `GET /documents` (scope padrão) sempre devolve apenas o que está vigente.
 */
const express = require('express');
const { applyCommonMiddleware, requireManage, writeAudit } = require('./middleware');
const {
  str,
  optionalStr,
  parseId,
  parseBoolean,
} = require('../../validators/justino360Validator');

/**
 * Categorias aceitas. As 7 primeiras são as expostas na UI; `ficha` e `norma`
 * continuam aceitas por compatibilidade com registros já existentes no banco.
 * Relatórios externos (nutricionista, dedetização, auditoria) usam `laudo`.
 */
const CATEGORIES = [
  'pop',
  'manual',
  'laudo',
  'procedimento',
  'certificado',
  'ata',
  'outro',
  'ficha',
  'norma',
];

/** Funções operacionais. `null` = documento geral, visível para todo mundo. */
const ROLE_KEYS = [
  'garcom',
  'barman',
  'caixa',
  'cozinha',
  'copa',
  'limpeza',
  'seguranca',
  'recepcao',
  'maitre',
  'runner',
  'gerencia',
];

const DOC_COLUMNS = `
        d.id, d.establishment_id, d.sector_id, d.category, d.role_key, d.title,
        d.description, d.file_url, d.version, d.is_current, d.replaces_id,
        d.uploaded_by, d.created_at, d.updated_at`;

function pickCategory(value, fallback) {
  if (value === undefined || value === null || value === '') return { ok: true, value: fallback };
  const v = String(value).trim().toLowerCase();
  if (!CATEGORIES.includes(v)) return { ok: false, value: null };
  return { ok: true, value: v };
}

function pickRoleKey(value) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  const v = String(value).trim().toLowerCase();
  if (!ROLE_KEYS.includes(v)) return { ok: false, value: null };
  return { ok: true, value: v };
}

const INVALID_CATEGORY = `Categoria inválida. Use uma de: ${CATEGORIES.join(', ')}.`;
const INVALID_ROLE = `Função inválida. Use uma de: ${ROLE_KEYS.join(', ')}.`;

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  /** Metadados para montar os selects da UI sem duplicar listas no front. */
  router.get('/documents/meta', (req, res) => {
    return res.json({
      success: true,
      data: { categories: CATEGORIES, role_keys: ROLE_KEYS, can_manage: req.j360CanManage },
    });
  });

  /**
   * GET /documents
   * scope: current (padrão) | archived | all
   * filtros: category, role_key (traz também os gerais), q (título/descrição)
   */
  router.get('/documents', async (req, res) => {
    const params = [req.j360EstablishmentId];
    const where = ['d.establishment_id = $1'];

    const scope = String(req.query.scope || 'current').trim().toLowerCase();
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
                u.name AS uploaded_by_name,
                (d.replaces_id IS NOT NULL) AS has_history
           FROM j360_documents d
           LEFT JOIN j360_sectors s ON s.id = d.sector_id
           LEFT JOIN users u ON u.id = d.uploaded_by
          WHERE ${where.join(' AND ')}
          ORDER BY d.category, d.title, d.version DESC
          LIMIT 500`,
        params
      );
      return res.json({
        success: true,
        data: result.rows,
        meta: { can_manage: req.j360CanManage, scope },
      });
    } catch (err) {
      console.error(
        `[j360] docs list (establishment_id=${req.j360EstablishmentId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao listar documentos.' });
    }
  });

  /** Histórico completo de versões de um documento (sobe e desce a cadeia). */
  router.get('/documents/:id/versions', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });
    try {
      const result = await pool.query(
        `WITH RECURSIVE chain AS (
           SELECT d.* FROM j360_documents d
            WHERE d.id = $1 AND d.establishment_id = $2
           UNION
           SELECT d.* FROM j360_documents d
             JOIN chain c ON d.id = c.replaces_id OR d.replaces_id = c.id
            WHERE d.establishment_id = $2
         )
         SELECT c.id, c.category, c.role_key, c.title, c.description, c.file_url,
                c.version, c.is_current, c.replaces_id, c.created_at, c.updated_at,
                u.name AS uploaded_by_name
           FROM chain c
           LEFT JOIN users u ON u.id = c.uploaded_by
          ORDER BY c.version DESC, c.id DESC`,
        [id, req.j360EstablishmentId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Documento não encontrado.' });
      }
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error(
        `[j360] docs versions (document_id=${id}, establishment_id=${req.j360EstablishmentId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao carregar histórico.' });
    }
  });

  router.post('/documents', requireManage, async (req, res) => {
    const title = str(req.body.title, 300);
    if (!title) return res.status(400).json({ success: false, message: 'Título obrigatório.' });

    const category = pickCategory(req.body.category, 'pop');
    if (!category.ok) return res.status(400).json({ success: false, message: INVALID_CATEGORY });

    const roleKey = pickRoleKey(req.body.role_key);
    if (!roleKey.ok) return res.status(400).json({ success: false, message: INVALID_ROLE });

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
          `SELECT id, version FROM j360_documents
            WHERE id = $1 AND establishment_id = $2
            FOR UPDATE`,
          [replacesId, req.j360EstablishmentId]
        );
        if (!prev.rows[0]) {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res
            .status(404)
            .json({ success: false, message: 'Versão anterior não encontrada.' });
        }
        version = (prev.rows[0].version || 0) + 1;
        await client.query(
          `UPDATE j360_documents SET is_current = FALSE, updated_at = NOW()
            WHERE id = $1 AND establishment_id = $2`,
          [replacesId, req.j360EstablishmentId]
        );
      }

      const result = await client.query(
        `INSERT INTO j360_documents
          (establishment_id, sector_id, category, role_key, title, description, file_url,
           version, is_current, replaces_id, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,$9,$10)
         RETURNING *`,
        [
          req.j360EstablishmentId,
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
        establishmentId: req.j360EstablishmentId,
        entityType: 'document',
        entityId: result.rows[0].id,
        action: replacesId ? 'new_version' : 'create',
        actorUserId,
        payload: { category: category.value, role_key: roleKey.value, version, replacesId },
      });
      return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      if (inTransaction) {
        await client.query('ROLLBACK').catch(() => {});
      }
      console.error(
        `[j360] docs create (establishment_id=${req.j360EstablishmentId}, replaces_id=${replacesId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao salvar documento.' });
    } finally {
      client.release();
    }
  });

  /** Ajustes de metadados e arquivamento (is_current = false). */
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
    if (req.body.description !== undefined) {
      pushSet('description', optionalStr(req.body.description, 4000));
    }
    if (req.body.file_url !== undefined) {
      pushSet('file_url', optionalStr(req.body.file_url, 1000));
    }
    if (req.body.sector_id !== undefined) {
      pushSet('sector_id', parseId(req.body.sector_id));
    }
    if (req.body.category !== undefined) {
      const category = pickCategory(req.body.category, null);
      if (!category.ok || !category.value) {
        return res.status(400).json({ success: false, message: INVALID_CATEGORY });
      }
      pushSet('category', category.value);
    }
    if (req.body.role_key !== undefined) {
      const roleKey = pickRoleKey(req.body.role_key);
      if (!roleKey.ok) return res.status(400).json({ success: false, message: INVALID_ROLE });
      pushSet('role_key', roleKey.value);
    }
    const isCurrent =
      req.body.is_current === undefined ? null : parseBoolean(req.body.is_current, true);
    if (isCurrent !== null) {
      pushSet('is_current', isCurrent);
    }

    if (sets.length === 0) {
      return res.status(400).json({ success: false, message: 'Nenhum campo para atualizar.' });
    }

    params.push(id, req.j360EstablishmentId);
    try {
      const result = await pool.query(
        `UPDATE j360_documents
            SET ${sets.join(', ')}, updated_at = NOW()
          WHERE id = $${params.length - 1} AND establishment_id = $${params.length}
          RETURNING *`,
        params
      );
      if (!result.rows[0]) {
        return res.status(404).json({ success: false, message: 'Documento não encontrado.' });
      }
      await writeAudit(pool, {
        establishmentId: req.j360EstablishmentId,
        entityType: 'document',
        entityId: id,
        action: req.body.is_current === false ? 'archive' : 'update',
        actorUserId: req.user.id || req.user.userId,
      });
      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error(
        `[j360] docs update (document_id=${id}, establishment_id=${req.j360EstablishmentId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao atualizar documento.' });
    }
  });

  return router;
};

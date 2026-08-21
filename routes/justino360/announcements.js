'use strict';

/**
 * Justino360 — Comunicados internos com registro de ciência.
 *
 * Cada colaborador tem uma linha em j360_announcement_reads com três marcos:
 * received_at (entregue/visto na lista), read_at (abriu) e acked_at (confirmou
 * ciência). A gestão consegue auditar quem confirmou em /receipts.
 *
 * Não confundir com `intranet_announcements` (módulo legado, intocado).
 */
const express = require('express');
const { applyCommonMiddleware, requireManage, writeAudit } = require('./middleware');
const {
  str,
  optionalStr,
  parseId,
  parseBoolean,
} = require('../../validators/justino360Validator');

/** `media` segue aceito por compatibilidade com registros antigos. */
const PRIORITIES = ['baixa', 'normal', 'media', 'alta', 'critica'];

const INVALID_PRIORITY = `Prioridade inválida. Use uma de: ${PRIORITIES.join(', ')}.`;

function pickPriority(value, fallback) {
  if (value === undefined || value === null || value === '') return { ok: true, value: fallback };
  const v = String(value).trim().toLowerCase();
  if (!PRIORITIES.includes(v)) return { ok: false, value: null };
  return { ok: true, value: v };
}

/** Aceita ISO ou `YYYY-MM-DDTHH:mm` do <input type="datetime-local">. */
function pickTimestamp(value) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  const raw = optionalStr(value, 40);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return { ok: false, value: null };
  return { ok: true, value: parsed.toISOString() };
}

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  /**
   * GET /announcements
   * scope: active (padrão — vigentes e não expirados) | all (gestão)
   */
  router.get('/announcements', async (req, res) => {
    const userId = req.user.id || req.user.userId;
    const scope = String(req.query.scope || 'active').trim().toLowerCase();
    const showAll = scope === 'all' && req.j360CanManage;

    const where = ['a.establishment_id = $1'];
    if (!showAll) {
      where.push('a.is_active = TRUE');
      where.push('(a.expires_at IS NULL OR a.expires_at > NOW())');
    }

    try {
      const result = await pool.query(
        `SELECT a.id, a.establishment_id, a.sector_id, a.title, a.body, a.priority,
                a.requires_ack, a.created_by, a.published_at, a.expires_at, a.is_active,
                s.name AS sector_name,
                u.name AS created_by_name,
                r.received_at, r.read_at, r.acked_at,
                (SELECT COUNT(*)::int FROM j360_announcement_reads x
                  WHERE x.announcement_id = a.id) AS receipts_count,
                (SELECT COUNT(*)::int FROM j360_announcement_reads x
                  WHERE x.announcement_id = a.id AND x.read_at IS NOT NULL) AS read_count,
                (SELECT COUNT(*)::int FROM j360_announcement_reads x
                  WHERE x.announcement_id = a.id AND x.acked_at IS NOT NULL) AS ack_count
           FROM j360_announcements a
           LEFT JOIN j360_sectors s ON s.id = a.sector_id
           LEFT JOIN users u ON u.id = a.created_by
           LEFT JOIN j360_announcement_reads r
             ON r.announcement_id = a.id AND r.user_id = $2
          WHERE ${where.join(' AND ')}
          ORDER BY a.published_at DESC
          LIMIT 100`,
        [req.j360EstablishmentId, userId || 0]
      );
      return res.json({
        success: true,
        data: result.rows,
        meta: { can_manage: req.j360CanManage, scope: showAll ? 'all' : 'active' },
      });
    } catch (err) {
      console.error(
        `[j360] announcements list (establishment_id=${req.j360EstablishmentId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao listar comunicados.' });
    }
  });

  /** Quem recebeu, leu e confirmou ciência — visão de gestão. */
  router.get('/announcements/:id/receipts', requireManage, async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });
    try {
      const exists = await pool.query(
        `SELECT id FROM j360_announcements WHERE id = $1 AND establishment_id = $2`,
        [id, req.j360EstablishmentId]
      );
      if (!exists.rows[0]) {
        return res.status(404).json({ success: false, message: 'Comunicado não encontrado.' });
      }
      const result = await pool.query(
        `SELECT r.user_id, r.received_at, r.read_at, r.acked_at,
                u.name AS user_name, u.email AS user_email
           FROM j360_announcement_reads r
           LEFT JOIN users u ON u.id = r.user_id
          WHERE r.announcement_id = $1
          ORDER BY r.acked_at DESC NULLS LAST, r.received_at DESC
          LIMIT 500`,
        [id]
      );
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error(
        `[j360] announcement receipts (announcement_id=${id}, establishment_id=${req.j360EstablishmentId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao carregar ciências.' });
    }
  });

  router.post('/announcements', requireManage, async (req, res) => {
    const title = str(req.body.title, 300);
    const body = str(req.body.body, 8000);
    if (!title || !body) {
      return res.status(400).json({ success: false, message: 'Título e mensagem são obrigatórios.' });
    }

    const priority = pickPriority(req.body.priority, 'normal');
    if (!priority.ok) return res.status(400).json({ success: false, message: INVALID_PRIORITY });

    const expiresAt = pickTimestamp(req.body.expires_at);
    if (!expiresAt.ok) {
      return res.status(400).json({ success: false, message: 'Data de expiração inválida.' });
    }

    const actorUserId = req.user.id || req.user.userId;
    try {
      const result = await pool.query(
        `INSERT INTO j360_announcements
          (establishment_id, sector_id, title, body, priority, requires_ack, created_by, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [
          req.j360EstablishmentId,
          parseId(req.body.sector_id),
          title,
          body,
          priority.value,
          parseBoolean(req.body.requires_ack, true),
          actorUserId,
          expiresAt.value,
        ]
      );
      await writeAudit(pool, {
        establishmentId: req.j360EstablishmentId,
        entityType: 'announcement',
        entityId: result.rows[0].id,
        action: 'create',
        actorUserId,
        payload: { priority: priority.value, requires_ack: result.rows[0].requires_ack },
      });
      return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error(
        `[j360] announcement create (establishment_id=${req.j360EstablishmentId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao publicar comunicado.' });
    }
  });

  /** Encerrar/reativar comunicado (sem apagar histórico de ciência). */
  router.patch('/announcements/:id', requireManage, async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });

    const sets = [];
    const params = [];
    const pushSet = (column, value) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };

    const isActive =
      req.body.is_active === undefined ? null : parseBoolean(req.body.is_active, true);
    if (isActive !== null) {
      pushSet('is_active', isActive);
    }
    if (req.body.priority !== undefined) {
      const priority = pickPriority(req.body.priority, null);
      if (!priority.ok || !priority.value) {
        return res.status(400).json({ success: false, message: INVALID_PRIORITY });
      }
      pushSet('priority', priority.value);
    }
    if (req.body.expires_at !== undefined) {
      const expiresAt = pickTimestamp(req.body.expires_at);
      if (!expiresAt.ok) {
        return res.status(400).json({ success: false, message: 'Data de expiração inválida.' });
      }
      pushSet('expires_at', expiresAt.value);
    }
    if (sets.length === 0) {
      return res.status(400).json({ success: false, message: 'Nenhum campo para atualizar.' });
    }

    params.push(id, req.j360EstablishmentId);
    try {
      const result = await pool.query(
        `UPDATE j360_announcements SET ${sets.join(', ')}
          WHERE id = $${params.length - 1} AND establishment_id = $${params.length}
          RETURNING *`,
        params
      );
      if (!result.rows[0]) {
        return res.status(404).json({ success: false, message: 'Comunicado não encontrado.' });
      }
      await writeAudit(pool, {
        establishmentId: req.j360EstablishmentId,
        entityType: 'announcement',
        entityId: id,
        action: isActive === false ? 'close' : 'update',
        actorUserId: req.user.id || req.user.userId,
      });
      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error(
        `[j360] announcement update (announcement_id=${id}, establishment_id=${req.j360EstablishmentId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao atualizar comunicado.' });
    }
  });

  /**
   * Registra recebimento/leitura. Idempotente: não sobrescreve read_at anterior
   * nem apaga a ciência já dada.
   */
  router.post('/announcements/:id/read', async (req, res) => {
    return upsertReceipt(req, res, { ack: false });
  });

  /** Confirmação de ciência ("estou ciente"). */
  router.post('/announcements/:id/ack', async (req, res) => {
    return upsertReceipt(req, res, { ack: true });
  });

  async function upsertReceipt(req, res, { ack }) {
    const id = parseId(req.params.id);
    const userId = req.user.id || req.user.userId;
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Usuário não identificado.' });
    }
    try {
      const exists = await pool.query(
        `SELECT id, requires_ack FROM j360_announcements
          WHERE id = $1 AND establishment_id = $2 AND is_active = TRUE`,
        [id, req.j360EstablishmentId]
      );
      if (!exists.rows[0]) {
        return res.status(404).json({ success: false, message: 'Comunicado não encontrado.' });
      }
      const result = await pool.query(
        `INSERT INTO j360_announcement_reads (announcement_id, user_id, received_at, read_at, acked_at)
         VALUES ($1, $2, NOW(), NOW(), CASE WHEN $3::boolean THEN NOW() ELSE NULL END)
         ON CONFLICT (announcement_id, user_id) DO UPDATE
           SET read_at = COALESCE(j360_announcement_reads.read_at, NOW()),
               acked_at = CASE
                 WHEN $3::boolean THEN COALESCE(j360_announcement_reads.acked_at, NOW())
                 ELSE j360_announcement_reads.acked_at
               END
         RETURNING *`,
        [id, userId, ack]
      );
      if (ack) {
        await writeAudit(pool, {
          establishmentId: req.j360EstablishmentId,
          entityType: 'announcement',
          entityId: id,
          action: 'ack',
          actorUserId: userId,
        });
      }
      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error(
        `[j360] announcement ${ack ? 'ack' : 'read'} (announcement_id=${id}, user_id=${userId}):`,
        err.message
      );
      return res.status(500).json({
        success: false,
        message: ack ? 'Falha ao confirmar ciência.' : 'Falha ao registrar leitura.',
      });
    }
  }

  return router;
};

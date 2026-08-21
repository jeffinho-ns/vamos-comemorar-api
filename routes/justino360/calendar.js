'use strict';

const express = require('express');
const { applyCommonMiddleware, requireManage, writeAudit } = require('./middleware');
const { str, optionalStr, parseId } = require('../../validators/justino360Validator');

const SECTOR_IMPACT_HINTS = {
  gerencia: 'Evento especial — acompanhar operação geral.',
  salao: 'Previsão de alta ocupação — reforçar equipe e montagem.',
  bar: 'Preparação adicional de estoque e produção.',
  cozinha: 'Ajuste de produção conforme volume esperado.',
  caixa: 'Operação especial — conferir procedimentos.',
  limpeza: 'Reforço de equipe e rotinas.',
  manutencao: 'Verificar infraestrutura antes do evento.',
  marketing: 'Acompanhar ativação e materiais.',
};

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  router.get('/calendar', async (req, res) => {
    const from = str(req.query.from || new Date().toISOString().slice(0, 10), 10);
    const to = str(req.query.to || '', 10);
    const params = [req.j360EstablishmentId, from];
    let sql = `
      SELECT * FROM j360_calendar_events
       WHERE establishment_id = $1 AND starts_at >= $2::date`;
    if (to) {
      params.push(to);
      sql += ` AND starts_at < ($${params.length}::date + INTERVAL '1 day')`;
    } else {
      sql += ` AND starts_at < ($2::date + INTERVAL '30 days')`;
    }
    sql += ' ORDER BY starts_at';
    try {
      const result = await pool.query(sql, params);
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error('[j360] calendar:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao listar calendário.' });
    }
  });

  router.post('/calendar', requireManage, async (req, res) => {
    const title = str(req.body.title, 300);
    const startsAt = optionalStr(req.body.starts_at, 40);
    if (!title || !startsAt) {
      return res.status(400).json({ success: false, message: 'Título e starts_at obrigatórios.' });
    }
    let impactIds = Array.isArray(req.body.impact_sector_ids)
      ? req.body.impact_sector_ids.map(parseId).filter(Boolean)
      : [];
    try {
      if (impactIds.length === 0) {
        const secs = await pool.query(
          `SELECT id FROM j360_sectors WHERE establishment_id = $1 AND key = ANY($2)`,
          [req.j360EstablishmentId, ['gerencia', 'salao', 'bar', 'cozinha', 'caixa', 'limpeza']]
        );
        impactIds = secs.rows.map((r) => r.id);
      }
      const sectors = await pool.query(
        `SELECT id, key, name FROM j360_sectors WHERE establishment_id = $1 AND id = ANY($2)`,
        [req.j360EstablishmentId, impactIds]
      );
      const autoBrief = sectors.rows
        .map((s) => `${s.name}: ${SECTOR_IMPACT_HINTS[s.key] || 'Atenção operacional.'}`)
        .join('\n');
      const briefing = optionalStr(req.body.briefing, 4000) || autoBrief;

      const result = await pool.query(
        `INSERT INTO j360_calendar_events
          (establishment_id, title, description, event_type, starts_at, ends_at,
           impact_sector_ids, briefing, materials_url, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          req.j360EstablishmentId,
          title,
          optionalStr(req.body.description, 4000),
          str(req.body.event_type || 'evento', 80),
          startsAt,
          optionalStr(req.body.ends_at, 40),
          impactIds,
          briefing,
          optionalStr(req.body.materials_url, 1000),
          req.user.id || req.user.userId,
        ]
      );
      await writeAudit(pool, {
        establishmentId: req.j360EstablishmentId,
        entityType: 'calendar_event',
        entityId: result.rows[0].id,
        action: 'create',
        actorUserId: req.user.id || req.user.userId,
      });
      return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error('[j360] calendar create:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao criar evento.' });
    }
  });

  return router;
};

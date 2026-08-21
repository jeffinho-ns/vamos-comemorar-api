'use strict';

/**
 * Justino360 — Calendário operacional (Marketing → Operação).
 *
 * O Marketing cadastra a ação (campanha, promoção, gravação, cardápio novo) e o
 * sistema traduz em briefing por setor impactado, que a equipe lê em
 * /justino360/agenda. Cancelar é soft delete (is_active = FALSE): a equipe já
 * leu o briefing, então o histórico precisa continuar auditável.
 *
 * Não confundir com `operational_details` (OS de evento) nem com o calendário
 * de reservas — módulos distintos e intocados aqui.
 */
const express = require('express');
const { applyCommonMiddleware, requireManage, writeAudit } = require('./middleware');
const {
  str,
  optionalStr,
  parseId,
  parseBoolean,
  parseTimestamp,
  parseDateOnly,
  oneOf,
} = require('../../validators/justino360Validator');
const {
  EVENT_TYPES,
  buildBriefing,
  impactForSector,
  regenerateIfAuto,
} = require('../../services/justino360/calendarBriefing');
const {
  IMPACT_SECTORS_JSON,
  todayISO,
  parseWindowDays,
  resolveImpactSectors,
  loadSectorsByIds,
  loadSectorKey,
} = require('../../services/justino360/calendarSectors');

const INVALID_EVENT_TYPE = `Tipo inválido. Use um de: ${EVENT_TYPES.join(', ')}.`;
const NO_SECTOR = 'Selecione ao menos um setor impactado.';
const END_BEFORE_START = 'Término não pode ser antes do início.';

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  /**
   * GET /calendar
   * from=YYYY-MM-DD (padrão hoje) · to=YYYY-MM-DD · days=N (padrão 30)
   * event_type · scope=active|all (all só para gestão; inclui cancelados)
   * sector_id  — setor de quem está lendo: devolve `sector_briefing` nos
   *              eventos que impactam esse setor, sem esconder os demais.
   * only_sector — restringe a lista aos eventos que impactam esse setor.
   */
  router.get('/calendar', async (req, res) => {
    const from = parseDateOnly(req.query.from);
    const to = parseDateOnly(req.query.to);
    if (!from.ok || !to.ok) {
      return res.status(400).json({ success: false, message: 'Datas inválidas. Use YYYY-MM-DD.' });
    }
    const eventType = req.query.event_type ? oneOf(req.query.event_type, EVENT_TYPES) : null;
    if (req.query.event_type && !eventType) {
      return res.status(400).json({ success: false, message: INVALID_EVENT_TYPE });
    }
    const sectorId = parseId(req.query.sector_id);
    const showAll = String(req.query.scope || '').toLowerCase() === 'all' && req.j360CanManage;

    const start = from.value || todayISO();
    const params = [req.j360EstablishmentId, start];
    const where = ['e.establishment_id = $1', 'e.starts_at >= $2::date'];

    if (to.value) {
      params.push(to.value);
      where.push(`e.starts_at < ($${params.length}::date + INTERVAL '1 day')`);
    } else {
      params.push(parseWindowDays(req.query.days));
      where.push(`e.starts_at < ($2::date + make_interval(days => $${params.length}::int))`);
    }
    if (!showAll) where.push('e.is_active = TRUE');
    if (eventType) {
      params.push(eventType);
      where.push(`e.event_type = $${params.length}`);
    }
    if (sectorId && parseBoolean(req.query.only_sector, false)) {
      params.push(sectorId);
      where.push(`$${params.length} = ANY(e.impact_sector_ids)`);
    }

    try {
      const result = await pool.query(
        `SELECT e.*, u.name AS created_by_name, ${IMPACT_SECTORS_JSON}
           FROM j360_calendar_events e
           LEFT JOIN users u ON u.id = e.created_by
          WHERE ${where.join(' AND ')}
          ORDER BY e.starts_at
          LIMIT 300`,
        params
      );

      const sectorKey = await loadSectorKey(pool, req.j360EstablishmentId, sectorId);
      const data = result.rows.map((row) => ({
        ...row,
        sector_briefing:
          sectorKey && (row.impact_sector_ids || []).includes(sectorId)
            ? impactForSector(row.event_type, sectorKey)
            : null,
      }));

      return res.json({
        success: true,
        data,
        meta: { can_manage: req.j360CanManage, from: start, scope: showAll ? 'all' : 'active' },
      });
    } catch (err) {
      console.error(
        `[j360] calendar list (establishment_id=${req.j360EstablishmentId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao listar calendário.' });
    }
  });

  router.get('/calendar/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });
    try {
      const result = await pool.query(
        `SELECT e.*, u.name AS created_by_name, ${IMPACT_SECTORS_JSON}
           FROM j360_calendar_events e
           LEFT JOIN users u ON u.id = e.created_by
          WHERE e.id = $1 AND e.establishment_id = $2`,
        [id, req.j360EstablishmentId]
      );
      if (!result.rows[0]) {
        return res.status(404).json({ success: false, message: 'Evento não encontrado.' });
      }
      return res.json({
        success: true,
        data: result.rows[0],
        meta: { can_manage: req.j360CanManage },
      });
    } catch (err) {
      console.error(
        `[j360] calendar get (event_id=${id}, establishment_id=${req.j360EstablishmentId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao carregar evento.' });
    }
  });

  router.post('/calendar', requireManage, async (req, res) => {
    const title = str(req.body.title, 300);
    const startsAt = parseTimestamp(req.body.starts_at);
    const endsAt = parseTimestamp(req.body.ends_at);

    if (!title) return res.status(400).json({ success: false, message: 'Título é obrigatório.' });
    if (!startsAt.ok || !startsAt.value) {
      return res.status(400).json({ success: false, message: 'Data de início inválida.' });
    }
    if (!endsAt.ok) {
      return res.status(400).json({ success: false, message: 'Data de término inválida.' });
    }
    if (endsAt.value && endsAt.value < startsAt.value) {
      return res.status(400).json({ success: false, message: END_BEFORE_START });
    }
    const eventType = oneOf(req.body.event_type || 'evento', EVENT_TYPES, null);
    if (!eventType) return res.status(400).json({ success: false, message: INVALID_EVENT_TYPE });

    const actorUserId = req.user.id || req.user.userId;
    try {
      const sectors = await resolveImpactSectors(
        pool,
        req.j360EstablishmentId,
        req.body.impact_sector_ids
      );
      if (sectors.length === 0) {
        return res.status(400).json({ success: false, message: NO_SECTOR });
      }
      const briefing =
        optionalStr(req.body.briefing, 4000) || buildBriefing({ eventType, sectors });

      const result = await pool.query(
        `INSERT INTO j360_calendar_events
          (establishment_id, title, description, event_type, starts_at, ends_at,
           impact_sector_ids, briefing, materials_url, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          req.j360EstablishmentId,
          title,
          optionalStr(req.body.description, 4000),
          eventType,
          startsAt.value,
          endsAt.value,
          sectors.map((s) => s.id),
          briefing,
          optionalStr(req.body.materials_url, 1000),
          actorUserId,
        ]
      );
      await writeAudit(pool, {
        establishmentId: req.j360EstablishmentId,
        entityType: 'calendar_event',
        entityId: result.rows[0].id,
        action: 'create',
        actorUserId,
        payload: { event_type: eventType, impact_sector_ids: sectors.map((s) => s.id) },
      });
      return res.status(201).json({
        success: true,
        data: { ...result.rows[0], impact_sectors: sectors },
      });
    } catch (err) {
      console.error(
        `[j360] calendar create (establishment_id=${req.j360EstablishmentId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao criar evento.' });
    }
  });

  /**
   * PATCH /calendar/:id — edição e cancelamento/reativação (is_active).
   * O briefing automático é recalculado quando o gestor não o editou à mão:
   * se o texto salvo é exatamente o gerado pelos valores antigos, ele volta a
   * ser gerado com os novos. Briefing escrito à mão nunca é sobrescrito.
   */
  router.patch('/calendar/:id', requireManage, async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });

    const actorUserId = req.user.id || req.user.userId;
    try {
      const current = await pool.query(
        `SELECT * FROM j360_calendar_events WHERE id = $1 AND establishment_id = $2`,
        [id, req.j360EstablishmentId]
      );
      const event = current.rows[0];
      if (!event) return res.status(404).json({ success: false, message: 'Evento não encontrado.' });

      const sets = [];
      const params = [];
      const push = (column, value) => {
        params.push(value);
        sets.push(`${column} = $${params.length}`);
      };

      if (req.body.title !== undefined) {
        const title = str(req.body.title, 300);
        if (!title) return res.status(400).json({ success: false, message: 'Título é obrigatório.' });
        push('title', title);
      }
      if (req.body.description !== undefined) {
        push('description', optionalStr(req.body.description, 4000));
      }
      if (req.body.materials_url !== undefined) {
        push('materials_url', optionalStr(req.body.materials_url, 1000));
      }
      if (req.body.is_active !== undefined) {
        push('is_active', parseBoolean(req.body.is_active, true));
      }

      let eventType = event.event_type;
      if (req.body.event_type !== undefined) {
        eventType = oneOf(req.body.event_type, EVENT_TYPES, null);
        if (!eventType) return res.status(400).json({ success: false, message: INVALID_EVENT_TYPE });
        push('event_type', eventType);
      }

      // Base para validar o término: o novo início, ou o já salvo (Date do pg).
      let nextStartISO = new Date(event.starts_at).toISOString();
      if (req.body.starts_at !== undefined) {
        const startsAt = parseTimestamp(req.body.starts_at);
        if (!startsAt.ok || !startsAt.value) {
          return res.status(400).json({ success: false, message: 'Data de início inválida.' });
        }
        nextStartISO = startsAt.value;
        push('starts_at', nextStartISO);
      }

      if (req.body.ends_at !== undefined) {
        const endsAt = parseTimestamp(req.body.ends_at);
        if (!endsAt.ok) {
          return res.status(400).json({ success: false, message: 'Data de término inválida.' });
        }
        if (endsAt.value && endsAt.value < nextStartISO) {
          return res.status(400).json({ success: false, message: END_BEFORE_START });
        }
        push('ends_at', endsAt.value);
      }

      let sectors = null;
      if (req.body.impact_sector_ids !== undefined) {
        sectors = await resolveImpactSectors(
          pool,
          req.j360EstablishmentId,
          req.body.impact_sector_ids
        );
        if (sectors.length === 0) {
          return res.status(400).json({ success: false, message: NO_SECTOR });
        }
        push('impact_sector_ids', sectors.map((s) => s.id));
      }

      const changed = sectors !== null || eventType !== event.event_type;
      if (req.body.briefing !== undefined) {
        push('briefing', optionalStr(req.body.briefing, 4000));
      } else if (changed) {
        const old = await loadSectorsByIds(pool, req.j360EstablishmentId, event.impact_sector_ids);
        const next = regenerateIfAuto({
          storedBriefing: event.briefing,
          previous: { eventType: event.event_type, sectors: old },
          next: { eventType, sectors: sectors || old },
        });
        if (next !== null) push('briefing', next);
      }

      if (sets.length === 0) {
        return res.status(400).json({ success: false, message: 'Nenhum campo para atualizar.' });
      }

      push('updated_by', actorUserId);
      sets.push('updated_at = NOW()');
      params.push(id, req.j360EstablishmentId);

      const result = await pool.query(
        `UPDATE j360_calendar_events SET ${sets.join(', ')}
          WHERE id = $${params.length - 1} AND establishment_id = $${params.length}
          RETURNING *`,
        params
      );
      if (!result.rows[0]) {
        return res.status(404).json({ success: false, message: 'Evento não encontrado.' });
      }
      const impactSectors = await loadSectorsByIds(
        pool,
        req.j360EstablishmentId,
        result.rows[0].impact_sector_ids
      );
      await writeAudit(pool, {
        establishmentId: req.j360EstablishmentId,
        entityType: 'calendar_event',
        entityId: id,
        action: req.body.is_active === false ? 'cancel' : 'update',
        actorUserId,
      });
      return res.json({
        success: true,
        data: { ...result.rows[0], impact_sectors: impactSectors },
      });
    } catch (err) {
      console.error(
        `[j360] calendar update (event_id=${id}, establishment_id=${req.j360EstablishmentId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao atualizar evento.' });
    }
  });

  /** Cancelamento = soft delete. Reativar via PATCH { is_active: true }. */
  router.delete('/calendar/:id', requireManage, async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });
    const actorUserId = req.user.id || req.user.userId;
    try {
      const result = await pool.query(
        `UPDATE j360_calendar_events
            SET is_active = FALSE, updated_by = $3, updated_at = NOW()
          WHERE id = $1 AND establishment_id = $2
          RETURNING *`,
        [id, req.j360EstablishmentId, actorUserId]
      );
      if (!result.rows[0]) {
        return res.status(404).json({ success: false, message: 'Evento não encontrado.' });
      }
      await writeAudit(pool, {
        establishmentId: req.j360EstablishmentId,
        entityType: 'calendar_event',
        entityId: id,
        action: 'cancel',
        actorUserId,
      });
      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error(
        `[j360] calendar delete (event_id=${id}, establishment_id=${req.j360EstablishmentId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao cancelar evento.' });
    }
  });

  return router;
};

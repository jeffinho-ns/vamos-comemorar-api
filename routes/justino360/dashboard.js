'use strict';

const express = require('express');
const { applyCommonMiddleware, writeAudit } = require('./middleware');
const { str, optionalStr, parseId } = require('../../validators/justino360Validator');
const { MAINTENANCE_OPEN_STATUSES } = require('../../services/justino360/constants');

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  router.get('/sectors', async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, key, name, sort_order, is_active
           FROM j360_sectors
          WHERE establishment_id = $1 AND is_active = TRUE
          ORDER BY sort_order, name`,
        [req.j360EstablishmentId]
      );
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error('[j360] sectors:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao listar setores.' });
    }
  });

  router.get('/dashboard', async (req, res) => {
    const est = req.j360EstablishmentId;
    const today = new Date().toISOString().slice(0, 10);
    try {
      const [
        runsToday,
        runsLate,
        incidentsOpen,
        incidentsDone,
        tasksOpen,
        tasksDone,
        trainingsPending,
        unreadComms,
        tasksOverdue,
        incidentsCritical,
        runsPendingToday,
        maintenanceOpen,
      ] = await Promise.all([
          pool.query(
            `SELECT COUNT(*)::int AS c FROM j360_checklist_runs
              WHERE establishment_id = $1 AND run_date = $2 AND status = 'concluido'`,
            [est, today]
          ),
          pool.query(
            `SELECT COUNT(*)::int AS c FROM j360_checklist_runs
              WHERE establishment_id = $1 AND status IN ('em_andamento','atrasado')
                AND run_date <= $2`,
            [est, today]
          ),
          pool.query(
            `SELECT COUNT(*)::int AS c FROM j360_incidents
              WHERE establishment_id = $1 AND status IN ('aberta','em_andamento','aguardando')`,
            [est]
          ),
          pool.query(
            `SELECT COUNT(*)::int AS c FROM j360_incidents
              WHERE establishment_id = $1 AND status = 'solucionada'
                AND resolved_at::date = $2`,
            [est, today]
          ),
          pool.query(
            `SELECT COUNT(*)::int AS c FROM j360_tasks
              WHERE establishment_id = $1 AND status IN ('aberta','em_andamento','aguardando')`,
            [est]
          ),
          pool.query(
            `SELECT COUNT(*)::int AS c FROM j360_tasks
              WHERE establishment_id = $1 AND status IN ('concluida','validada')
                AND completed_at::date = $2`,
            [est, today]
          ),
          pool.query(
            `SELECT COUNT(*)::int AS c FROM j360_training_assignments ta
              JOIN j360_trainings t ON t.id = ta.training_id
             WHERE t.establishment_id = $1 AND ta.status IN ('pendente','em_andamento','vencido')`,
            [est]
          ),
          pool.query(
            `SELECT COUNT(*)::int AS c FROM j360_announcements a
              LEFT JOIN j360_announcement_reads r
                ON r.announcement_id = a.id AND r.user_id = $2
             WHERE a.establishment_id = $1 AND a.is_active = TRUE
               AND (r.acked_at IS NULL AND a.requires_ack = TRUE)`,
            [est, req.user.id || req.user.userId || 0]
          ),
          pool.query(
            `SELECT COUNT(*)::int AS c FROM j360_tasks
              WHERE establishment_id = $1
                AND status IN ('aberta','em_andamento','aguardando')
                AND due_at IS NOT NULL AND due_at < NOW()`,
            [est]
          ),
          pool.query(
            `SELECT COUNT(*)::int AS c FROM j360_incidents
              WHERE establishment_id = $1
                AND status IN ('aberta','em_andamento','aguardando')
                AND priority IN ('alta','critica')`,
            [est]
          ),
          pool.query(
            `SELECT COUNT(*)::int AS c
               FROM j360_checklist_templates t
              WHERE t.establishment_id = $1 AND t.is_active = TRUE
                AND NOT EXISTS (
                  SELECT 1 FROM j360_checklist_runs r
                   WHERE r.template_id = t.id AND r.run_date = $2
                )`,
            [est, today]
          ),
          pool.query(
            `SELECT COUNT(*)::int AS c FROM j360_asset_maintenance
              WHERE establishment_id = $1 AND status = ANY($2::text[])`,
            [est, MAINTENANCE_OPEN_STATUSES]
          ),
        ]);

      const bySector = await pool.query(
        `SELECT s.name AS sector,
                COUNT(t.id) FILTER (WHERE t.status IN ('aberta','em_andamento','aguardando'))::int AS tasks_open,
                COUNT(i.id) FILTER (WHERE i.status IN ('aberta','em_andamento','aguardando'))::int AS incidents_open
           FROM j360_sectors s
           LEFT JOIN j360_tasks t ON t.sector_id = s.id AND t.establishment_id = s.establishment_id
           LEFT JOIN j360_incidents i ON i.sector_id = s.id AND i.establishment_id = s.establishment_id
          WHERE s.establishment_id = $1 AND s.is_active = TRUE
          GROUP BY s.id, s.name, s.sort_order
          ORDER BY s.sort_order`,
        [est]
      );

      const recurring = await pool.query(
        `SELECT title, COUNT(*)::int AS times
           FROM j360_incidents
          WHERE establishment_id = $1
            AND created_at >= NOW() - INTERVAL '30 days'
          GROUP BY title
         HAVING COUNT(*) >= 2
          ORDER BY times DESC
          LIMIT 10`,
        [est]
      );

      return res.json({
        success: true,
        data: {
          checklists_concluidos_hoje: runsToday.rows[0].c,
          checklists_atrasados: runsLate.rows[0].c,
          ocorrencias_abertas: incidentsOpen.rows[0].c,
          ocorrencias_solucionadas_hoje: incidentsDone.rows[0].c,
          tarefas_abertas: tasksOpen.rows[0].c,
          tarefas_concluidas_hoje: tasksDone.rows[0].c,
          treinamentos_pendentes: trainingsPending.rows[0].c,
          comunicados_sem_ciencia: unreadComms.rows[0].c,
          tarefas_atrasadas: tasksOverdue.rows[0].c,
          ocorrencias_criticas: incidentsCritical.rows[0].c,
          checklists_nao_iniciados_hoje: runsPendingToday.rows[0].c,
          manutencoes_abertas: maintenanceOpen.rows[0].c,
          por_setor: bySector.rows,
          problemas_recorrentes: recurring.rows,
          can_manage: req.j360CanManage,
          can_validate: req.j360CanValidate,
        },
      });
    } catch (err) {
      console.error('[j360] dashboard:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao carregar dashboard.' });
    }
  });

  router.get('/home', async (req, res) => {
    const est = req.j360EstablishmentId;
    const userId = req.user.id || req.user.userId;
    const today = new Date().toISOString().slice(0, 10);
    try {
      const [tasks, runs, trainings, announcements, calendar, incidents, templates] = await Promise.all([
        pool.query(
          `SELECT t.id, t.title, t.priority, t.status, t.due_at, t.origin, t.evidence_url,
                  s.name AS sector_name,
                  (t.due_at IS NOT NULL AND t.due_at < NOW()) AS is_overdue
             FROM j360_tasks t
             LEFT JOIN j360_sectors s ON s.id = t.sector_id
            WHERE t.establishment_id = $1
              AND t.assigned_to = $2
              AND t.status IN ('aberta','em_andamento','aguardando')
            ORDER BY t.due_at NULLS LAST, t.created_at DESC
            LIMIT 20`,
          [est, userId]
        ),
        pool.query(
          `SELECT r.id, r.status, r.run_date, t.name AS template_name, s.name AS sector_name,
                  (SELECT COUNT(*)::int FROM j360_checklist_run_items i WHERE i.run_id = r.id) AS total_items,
                  (SELECT COUNT(*)::int FROM j360_checklist_run_items i
                    WHERE i.run_id = r.id AND i.status <> 'pendente') AS answered_items
             FROM j360_checklist_runs r
             JOIN j360_checklist_templates t ON t.id = r.template_id
             LEFT JOIN j360_sectors s ON s.id = r.sector_id
            WHERE r.establishment_id = $1 AND r.run_date = $2
            ORDER BY (r.status = 'em_andamento') DESC, r.started_at DESC
            LIMIT 20`,
          [est, today]
        ),
        pool.query(
          `SELECT ta.id, ta.status, ta.due_at, t.title
             FROM j360_training_assignments ta
             JOIN j360_trainings t ON t.id = ta.training_id
            WHERE t.establishment_id = $1 AND ta.user_id = $2
              AND ta.status IN ('pendente','em_andamento','vencido')
            ORDER BY ta.due_at NULLS LAST
            LIMIT 10`,
          [est, userId]
        ),
        pool.query(
          `SELECT a.id, a.title, a.published_at, a.requires_ack,
                  r.read_at, r.acked_at
             FROM j360_announcements a
             LEFT JOIN j360_announcement_reads r
               ON r.announcement_id = a.id AND r.user_id = $2
            WHERE a.establishment_id = $1 AND a.is_active = TRUE
            ORDER BY a.published_at DESC
            LIMIT 10`,
          [est, userId]
        ),
        pool.query(
          `SELECT id, title, starts_at, event_type, briefing
             FROM j360_calendar_events
            WHERE establishment_id = $1
              AND is_active = TRUE
              AND starts_at::date >= $2::date
              AND starts_at < ($2::date + INTERVAL '7 days')
            ORDER BY starts_at
            LIMIT 10`,
          [est, today]
        ),
        pool.query(
          `SELECT i.id, i.title, i.status, i.priority, i.evidence_url, i.created_at,
                  s.name AS sector_name
             FROM j360_incidents i
             LEFT JOIN j360_sectors s ON s.id = i.sector_id
            WHERE i.establishment_id = $1
              AND i.status IN ('aberta','em_andamento','aguardando')
              AND (i.assigned_to = $2 OR i.created_by = $2 OR i.priority IN ('alta','critica'))
            ORDER BY i.created_at DESC
            LIMIT 10`,
          [est, userId]
        ),
        pool.query(
          `SELECT t.id, t.name, t.shift_type, s.name AS sector_name,
                  (SELECT COUNT(*)::int FROM j360_checklist_template_items ti
                    WHERE ti.template_id = t.id AND ti.is_active) AS items_count
             FROM j360_checklist_templates t
             LEFT JOIN j360_sectors s ON s.id = t.sector_id
            WHERE t.establishment_id = $1 AND t.is_active = TRUE
              AND NOT EXISTS (
                SELECT 1 FROM j360_checklist_runs r
                 WHERE r.template_id = t.id AND r.run_date = $2
              )
            ORDER BY s.sort_order NULLS LAST, t.name
            LIMIT 20`,
          [est, today]
        ),
      ]);

      return res.json({
        success: true,
        data: {
          tarefas: tasks.rows,
          checklists: runs.rows,
          checklists_disponiveis: templates.rows,
          ocorrencias: incidents.rows,
          treinamentos: trainings.rows,
          comunicados: announcements.rows,
          agenda: calendar.rows,
          can_manage: req.j360CanManage,
          can_validate: req.j360CanValidate,
        },
      });
    } catch (err) {
      console.error('[j360] home:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao carregar início.' });
    }
  });

  // noop to satisfy lint if writeAudit unused in this file later
  void writeAudit;
  void str;
  void optionalStr;
  void parseId;

  return router;
};

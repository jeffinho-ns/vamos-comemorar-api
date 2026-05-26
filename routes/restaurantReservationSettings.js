const express = require('express');
const authenticateToken = require('../middleware/auth');
const { buildDefaultWeekly } = require('../services/operationalHours/defaultWeeklySchedule');

module.exports = (pool) => {
  const router = express.Router();

  const toLabel = (start, end) => `${start}–${end}`;

  const ensureTables = async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS restaurant_reservation_operating_hours (
        id SERIAL PRIMARY KEY,
        establishment_id INT NOT NULL,
        weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
        is_open BOOLEAN NOT NULL DEFAULT FALSE,
        start_time TIME NULL,
        end_time TIME NULL,
        second_start_time TIME NULL,
        second_end_time TIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(establishment_id, weekday)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS restaurant_reservation_date_overrides (
        id SERIAL PRIMARY KEY,
        establishment_id INT NOT NULL,
        override_date DATE NOT NULL,
        is_open BOOLEAN NOT NULL DEFAULT TRUE,
        start_time TIME NULL,
        end_time TIME NULL,
        second_start_time TIME NULL,
        second_end_time TIME NULL,
        note TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(establishment_id, override_date)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS restaurant_reservation_policy (
        establishment_id INT PRIMARY KEY,
        allow_capacity_override BOOLEAN NOT NULL DEFAULT FALSE,
        allow_outside_hours BOOLEAN NOT NULL DEFAULT FALSE,
        max_daily_people INT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(
      'ALTER TABLE restaurant_reservation_policy ADD COLUMN IF NOT EXISTS max_daily_people INT NULL;'
    );
  };

  router.get('/', async (req, res) => {
    try {
      await ensureTables();
      const establishmentId = Number(req.query.establishment_id);
      if (!Number.isFinite(establishmentId) || establishmentId <= 0) {
        return res.status(400).json({ success: false, error: 'establishment_id é obrigatório' });
      }

      const placeResult = await pool.query('SELECT name FROM places WHERE id = $1 LIMIT 1', [establishmentId]);
      const establishmentName = placeResult.rows[0]?.name || '';
      const defaults = buildDefaultWeekly(establishmentName);

      const weeklyResult = await pool.query(
        `SELECT establishment_id, weekday, is_open, start_time::text, end_time::text,
                second_start_time::text, second_end_time::text
           FROM restaurant_reservation_operating_hours
          WHERE establishment_id = $1
          ORDER BY weekday ASC`,
        [establishmentId]
      );

      const overrideResult = await pool.query(
        `SELECT id, establishment_id, override_date::text, is_open,
                start_time::text, end_time::text, second_start_time::text, second_end_time::text, note
           FROM restaurant_reservation_date_overrides
          WHERE establishment_id = $1
          ORDER BY override_date ASC`,
        [establishmentId]
      );

      const policyResult = await pool.query(
        `SELECT allow_capacity_override, allow_outside_hours, max_daily_people
           FROM restaurant_reservation_policy
          WHERE establishment_id = $1`,
        [establishmentId]
      );
      const policyRow = policyResult.rows[0];
      const rawMaxDaily = policyRow?.max_daily_people;
      const maxDaily =
        rawMaxDaily === null || rawMaxDaily === undefined
          ? null
          : Math.max(0, Number(rawMaxDaily) || 0);
      const policy = {
        allow_capacity_override: !!policyRow?.allow_capacity_override,
        allow_outside_hours: !!policyRow?.allow_outside_hours,
        max_daily_people: maxDaily && maxDaily > 0 ? maxDaily : null,
      };

      const byWeekday = new Map(weeklyResult.rows.map((r) => [Number(r.weekday), r]));
      const weekly = defaults.map((d) => {
        const saved = byWeekday.get(d.weekday);
        if (!saved) return d;
        return {
          weekday: d.weekday,
          is_open: !!saved.is_open,
          start_time: saved.start_time,
          end_time: saved.end_time,
          second_start_time: saved.second_start_time,
          second_end_time: saved.second_end_time,
          label: saved.is_open
            ? [saved.start_time && saved.end_time ? toLabel(saved.start_time.slice(0, 5), saved.end_time.slice(0, 5)) : null,
               saved.second_start_time && saved.second_end_time
                 ? toLabel(saved.second_start_time.slice(0, 5), saved.second_end_time.slice(0, 5))
                 : null]
                .filter(Boolean)
                .join(' | ')
            : 'Fechado',
        };
      });

      return res.json({
        success: true,
        establishment_id: establishmentId,
        establishment_name: establishmentName,
        weekly_settings: weekly,
        date_overrides: overrideResult.rows,
        policy,
      });
    } catch (error) {
      console.error('❌ Erro ao buscar configurações de operação:', error);
      return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });

  router.put('/weekly', authenticateToken, async (req, res) => {
    try {
      await ensureTables();
      const establishmentId = Number(req.body?.establishment_id);
      const weekly = Array.isArray(req.body?.weekly) ? req.body.weekly : [];
      if (!Number.isFinite(establishmentId) || establishmentId <= 0) {
        return res.status(400).json({ success: false, error: 'establishment_id inválido' });
      }

      await pool.query('BEGIN');
      for (const row of weekly) {
        const weekday = Number(row?.weekday);
        if (!Number.isFinite(weekday) || weekday < 0 || weekday > 6) continue;
        const isOpen = !!row?.is_open;
        const start = row?.start_time || null;
        const end = row?.end_time || null;
        const secondStart = row?.second_start_time || null;
        const secondEnd = row?.second_end_time || null;

        await pool.query(
          `INSERT INTO restaurant_reservation_operating_hours
             (establishment_id, weekday, is_open, start_time, end_time, second_start_time, second_end_time, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
           ON CONFLICT (establishment_id, weekday)
           DO UPDATE SET
             is_open = EXCLUDED.is_open,
             start_time = EXCLUDED.start_time,
             end_time = EXCLUDED.end_time,
             second_start_time = EXCLUDED.second_start_time,
             second_end_time = EXCLUDED.second_end_time,
             updated_at = NOW()`,
          [establishmentId, weekday, isOpen, start, end, secondStart, secondEnd]
        );
      }
      await pool.query('COMMIT');
      return res.json({ success: true });
    } catch (error) {
      await pool.query('ROLLBACK');
      console.error('❌ Erro ao salvar configuração semanal:', error);
      return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });

  router.post('/overrides', authenticateToken, async (req, res) => {
    try {
      await ensureTables();
      const establishmentId = Number(req.body?.establishment_id);
      const overrideDate = String(req.body?.override_date || '').trim();
      const isOpen = req.body?.is_open !== false;
      const start = req.body?.start_time || null;
      const end = req.body?.end_time || null;
      const secondStart = req.body?.second_start_time || null;
      const secondEnd = req.body?.second_end_time || null;
      const note = req.body?.note || null;

      if (!Number.isFinite(establishmentId) || establishmentId <= 0 || !overrideDate) {
        return res.status(400).json({ success: false, error: 'establishment_id e override_date são obrigatórios' });
      }

      const result = await pool.query(
        `INSERT INTO restaurant_reservation_date_overrides
           (establishment_id, override_date, is_open, start_time, end_time, second_start_time, second_end_time, note, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
         ON CONFLICT (establishment_id, override_date)
         DO UPDATE SET
           is_open = EXCLUDED.is_open,
           start_time = EXCLUDED.start_time,
           end_time = EXCLUDED.end_time,
           second_start_time = EXCLUDED.second_start_time,
           second_end_time = EXCLUDED.second_end_time,
           note = EXCLUDED.note,
           updated_at = NOW()
         RETURNING id, establishment_id, override_date::text, is_open,
                   start_time::text, end_time::text, second_start_time::text, second_end_time::text, note`,
        [establishmentId, overrideDate, isOpen, start, end, secondStart, secondEnd, note]
      );

      return res.status(201).json({ success: true, override: result.rows[0] });
    } catch (error) {
      console.error('❌ Erro ao salvar exceção de data:', error);
      return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });

  router.put('/policy', authenticateToken, async (req, res) => {
    try {
      await ensureTables();
      const establishmentId = Number(req.body?.establishment_id);
      if (!Number.isFinite(establishmentId) || establishmentId <= 0) {
        return res.status(400).json({ success: false, error: 'establishment_id inválido' });
      }
      const allow_capacity_override = !!req.body?.allow_capacity_override;
      const allow_outside_hours = !!req.body?.allow_outside_hours;

      const rawMaxDaily = req.body?.max_daily_people;
      let max_daily_people = null;
      if (rawMaxDaily !== undefined && rawMaxDaily !== null && rawMaxDaily !== '') {
        const parsed = Math.max(0, Math.floor(Number(rawMaxDaily) || 0));
        max_daily_people = parsed > 0 ? parsed : null;
      }

      await pool.query(
        `INSERT INTO restaurant_reservation_policy
           (establishment_id, allow_capacity_override, allow_outside_hours, max_daily_people, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (establishment_id)
         DO UPDATE SET
           allow_capacity_override = EXCLUDED.allow_capacity_override,
           allow_outside_hours = EXCLUDED.allow_outside_hours,
           max_daily_people = EXCLUDED.max_daily_people,
           updated_at = NOW()`,
        [establishmentId, allow_capacity_override, allow_outside_hours, max_daily_people]
      );

      return res.json({
        success: true,
        policy: { allow_capacity_override, allow_outside_hours, max_daily_people },
      });
    } catch (error) {
      console.error('❌ Erro ao salvar política de reservas:', error);
      return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });

  router.delete('/overrides/:id', authenticateToken, async (req, res) => {
    try {
      await ensureTables();
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ success: false, error: 'id inválido' });
      }
      await pool.query('DELETE FROM restaurant_reservation_date_overrides WHERE id = $1', [id]);
      return res.json({ success: true });
    } catch (error) {
      console.error('❌ Erro ao remover exceção de data:', error);
      return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });

  return router;
};

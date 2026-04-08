const express = require('express');
const authenticateToken = require('../middleware/auth');

module.exports = (pool) => {
  const router = express.Router();

  const toLabel = (start, end) => `${start}–${end}`;

  const buildDefaultWeekly = (name = '') => {
    const lower = String(name || '').toLowerCase();
    const days = Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      is_open: false,
      start_time: null,
      end_time: null,
      second_start_time: null,
      second_end_time: null,
      label: 'Fechado',
    }));

    const setDay = (weekday, start, end, secondStart = null, secondEnd = null) => {
      const labels = [toLabel(start, end)];
      if (secondStart && secondEnd) labels.push(toLabel(secondStart, secondEnd));
      days[weekday] = {
        weekday,
        is_open: true,
        start_time: start,
        end_time: end,
        second_start_time: secondStart,
        second_end_time: secondEnd,
        label: labels.join(' | '),
      };
    };

    const isRooftop = lower.includes('reserva rooftop') || lower.includes('rooftop');
    const isJustinoLike = lower.includes('seu justino') || lower.includes('pracinha');

    if (isRooftop) {
      setDay(2, '18:00', '22:30');
      setDay(3, '18:00', '22:30');
      setDay(4, '18:00', '22:30');
      setDay(5, '12:00', '16:00', '17:00', '22:30');
      setDay(6, '12:00', '16:00', '17:00', '22:30');
      setDay(0, '12:00', '16:00', '17:00', '20:30');
      return days;
    }

    if (isJustinoLike) {
      setDay(2, '18:00', '01:00');
      setDay(3, '18:00', '01:00');
      setDay(4, '18:00', '01:00');
      setDay(5, '18:00', '03:30');
      setDay(6, '18:00', '03:30');
      setDay(0, '12:00', '21:00');
      return days;
    }

    setDay(5, '18:00', '23:30');
    setDay(6, '14:00', '23:00');
    return days;
  };

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

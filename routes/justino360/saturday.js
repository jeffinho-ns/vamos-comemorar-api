'use strict';

const express = require('express');
const { applyCommonMiddleware, requireManage } = require('./middleware');
const { bonusForDay, consolidate, rankSales } = require('../../services/justino360/saturdayMeta');

function fail(res, status, message) {
  return res.status(status).json({ success: false, data: null, message });
}

function dateOnly(value) {
  const text = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function moneyOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number * 100) / 100;
}

function intOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) return null;
  return number;
}

function cleanSales(rows) {
  if (!Array.isArray(rows)) return { error: 'Informe as vendas.' };
  const clean = [];
  for (const row of rows) {
    const name = String(row?.waiter_name || '').trim();
    if (!name) continue;
    const amount = moneyOrNull(row.amount);
    if (amount == null) return { error: `Informe a venda de ${name}.` };
    const fee = row.service_fee == null || row.service_fee === '' ? 0 : moneyOrNull(row.service_fee);
    if (fee == null) return { error: `Taxa inválida de ${name}.` };
    const people = intOrNull(row.people_count);
    if (row.people_count != null && row.people_count !== '' && people == null) {
      return { error: `Pessoas inválidas de ${name}.` };
    }
    clean.push({
      name: name.slice(0, 160),
      code: String(row.waiter_code || '').trim().slice(0, 40) || null,
      amount,
      fee,
      people,
    });
  }
  return { clean };
}

function missingTable(err) {
  return err.code === '42P01' || err.code === '42703';
}

async function loadDay(pool, establishmentId, serviceDate) {
  const day = await pool.query(
    `SELECT * FROM j360_saturday_days
      WHERE establishment_id = $1 AND service_date = $2::date`,
    [establishmentId, serviceDate]
  );
  if (!day.rows[0]) return null;
  const sales = await pool.query(
    `SELECT id, waiter_name, waiter_code, amount, service_fee, people_count
       FROM j360_saturday_sales
      WHERE day_id = $1
      ORDER BY amount DESC, waiter_name`,
    [day.rows[0].id]
  );
  const ranked = rankSales(sales.rows);
  const revenue = day.rows[0].revenue_real != null
    ? Number(day.rows[0].revenue_real)
    : ranked.reduce((sum, row) => sum + row.amount, 0);
  return {
    ...day.rows[0],
    sales: ranked,
    bonus: bonusForDay({ revenue, sales: ranked }),
  };
}

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  router.get('/saturday', async (req, res) => {
    try {
      const rows = await pool.query(
        `SELECT d.*,
                COALESCE(SUM(s.amount), 0)::numeric AS sales_total,
                COUNT(s.id)::int AS sales_count
           FROM j360_saturday_days d
           LEFT JOIN j360_saturday_sales s ON s.day_id = d.id
          WHERE d.establishment_id = $1
          GROUP BY d.id
          ORDER BY d.service_date DESC
          LIMIT 60`,
        [req.j360EstablishmentId]
      );
      return res.json({ success: true, data: rows.rows, message: null });
    } catch (err) {
      if (err.code === '42P01') return res.json({ success: true, data: [], message: null });
      console.error('[justino360] saturday list:', err.message);
      return fail(res, 500, 'Falha ao listar os sábados.');
    }
  });

  router.get('/saturday/ranking', async (req, res) => {
    try {
      const rows = await pool.query(
        `SELECT d.service_date, s.waiter_name, s.waiter_code, s.amount, s.service_fee, s.people_count
           FROM j360_saturday_sales s
           JOIN j360_saturday_days d ON d.id = s.day_id
          WHERE d.establishment_id = $1
          ORDER BY d.service_date DESC, s.amount DESC`,
        [req.j360EstablishmentId]
      );
      const byDay = new Map();
      for (const row of rows.rows) {
        const key = String(row.service_date).slice(0, 10);
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key).push(row);
      }
      const days = [...byDay.entries()].map(([serviceDate, sales]) => ({
        service_date: serviceDate,
        sales: rankSales(sales),
      }));
      return res.json({ success: true, data: consolidate(days), message: null });
    } catch (err) {
      if (err.code === '42P01') return res.json({ success: true, data: [], message: null });
      console.error('[justino360] saturday ranking:', err.message);
      return fail(res, 500, 'Falha ao montar o ranking.');
    }
  });

  router.get('/saturday/:date', async (req, res) => {
    const serviceDate = dateOnly(req.params.date);
    if (!serviceDate) return fail(res, 400, 'Data inválida.');
    try {
      const day = await loadDay(pool, req.j360EstablishmentId, serviceDate);
      if (!day) return fail(res, 404, 'Sábado ainda não lançado.');
      return res.json({ success: true, data: day, message: null });
    } catch (err) {
      if (missingTable(err)) return fail(res, 503, 'Rode a migration da meta de sábado.');
      console.error('[justino360] saturday day:', err.message);
      return fail(res, 500, 'Falha ao abrir o sábado.');
    }
  });

  router.put('/saturday/:date', requireManage, async (req, res) => {
    const serviceDate = dateOnly(req.params.date);
    if (!serviceDate) return fail(res, 400, 'Data inválida.');
    const reservations = intOrNull(req.body?.reservations_confirmed);
    const walkin = intOrNull(req.body?.walkin_expected);
    const peopleFromPlan = reservations != null || walkin != null ? (reservations || 0) + (walkin || 0) : null;
    const peopleExpected = intOrNull(req.body?.people_expected) ?? peopleFromPlan;
    const peopleReal = intOrNull(req.body?.people_real);
    const waiters = intOrNull(req.body?.waiters_scheduled);
    const ticket = moneyOrNull(req.body?.ticket_expected);
    const goal = moneyOrNull(req.body?.revenue_goal)
      ?? (peopleExpected != null && ticket != null ? Math.round(peopleExpected * ticket * 100) / 100 : null);
    try {
      const saved = await pool.query(
        `INSERT INTO j360_saturday_days (
           establishment_id, service_date, people_expected, ticket_expected, revenue_goal,
           people_real, revenue_real, waiters_scheduled, reservations_confirmed, walkin_expected, created_by
         ) VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (establishment_id, service_date)
         DO UPDATE SET
           people_expected = EXCLUDED.people_expected,
           ticket_expected = EXCLUDED.ticket_expected,
           revenue_goal = EXCLUDED.revenue_goal,
           people_real = EXCLUDED.people_real,
           revenue_real = EXCLUDED.revenue_real,
           waiters_scheduled = EXCLUDED.waiters_scheduled,
           reservations_confirmed = EXCLUDED.reservations_confirmed,
           walkin_expected = EXCLUDED.walkin_expected,
           updated_at = NOW()
         RETURNING id`,
        [
          req.j360EstablishmentId,
          serviceDate,
          peopleExpected,
          ticket,
          goal,
          peopleReal,
          moneyOrNull(req.body?.revenue_real),
          waiters,
          reservations,
          walkin,
          req.user?.id || null,
        ]
      );
      const day = await loadDay(pool, req.j360EstablishmentId, serviceDate);
      return res.json({ success: true, data: day || saved.rows[0], message: null });
    } catch (err) {
      if (missingTable(err)) return fail(res, 503, 'Rode a migration da meta de sábado.');
      console.error('[justino360] saturday save:', err.message);
      return fail(res, 500, 'Falha ao salvar o sábado.');
    }
  });

  router.post('/saturday/:date/sales', requireManage, async (req, res) => {
    const serviceDate = dateOnly(req.params.date);
    const name = String(req.body?.waiter_name || '').trim();
    const amount = moneyOrNull(req.body?.amount);
    if (!serviceDate || !name || amount == null) {
      return fail(res, 400, 'Informe a data, o garçom e o valor.');
    }
    try {
      await pool.query(
        `INSERT INTO j360_saturday_days (establishment_id, service_date, created_by)
         VALUES ($1, $2::date, $3)
         ON CONFLICT (establishment_id, service_date) DO NOTHING`,
        [req.j360EstablishmentId, serviceDate, req.user?.id || null]
      );
      const day = await pool.query(
        `SELECT id FROM j360_saturday_days WHERE establishment_id = $1 AND service_date = $2::date`,
        [req.j360EstablishmentId, serviceDate]
      );
      const fee = req.body?.service_fee == null || req.body?.service_fee === '' ? 0 : moneyOrNull(req.body.service_fee);
      const people = intOrNull(req.body?.people_count);
      await pool.query(
        `INSERT INTO j360_saturday_sales (day_id, waiter_name, waiter_code, amount, service_fee, people_count)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          day.rows[0].id,
          name.slice(0, 160),
          String(req.body?.waiter_code || '').trim().slice(0, 40) || null,
          amount,
          fee == null ? 0 : fee,
          people,
        ]
      );
      return res.json({
        success: true,
        data: await loadDay(pool, req.j360EstablishmentId, serviceDate),
        message: null,
      });
    } catch (err) {
      if (missingTable(err)) return fail(res, 503, 'Rode a migration da meta de sábado.');
      console.error('[justino360] saturday sale:', err.message);
      return fail(res, 500, 'Falha ao lançar a venda.');
    }
  });

  router.put('/saturday/:date/sales', requireManage, async (req, res) => {
    const serviceDate = dateOnly(req.params.date);
    if (!serviceDate) return fail(res, 400, 'Data inválida.');
    const parsed = cleanSales(req.body?.sales);
    if (parsed.error) return fail(res, 400, parsed.error);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO j360_saturday_days (establishment_id, service_date, created_by)
         VALUES ($1, $2::date, $3)
         ON CONFLICT (establishment_id, service_date) DO NOTHING`,
        [req.j360EstablishmentId, serviceDate, req.user?.id || null]
      );
      const day = await client.query(
        `SELECT id FROM j360_saturday_days WHERE establishment_id = $1 AND service_date = $2::date`,
        [req.j360EstablishmentId, serviceDate]
      );
      await client.query('DELETE FROM j360_saturday_sales WHERE day_id = $1', [day.rows[0].id]);
      for (const sale of parsed.clean) {
        await client.query(
          `INSERT INTO j360_saturday_sales (day_id, waiter_name, waiter_code, amount, service_fee, people_count)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [day.rows[0].id, sale.name, sale.code, sale.amount, sale.fee, sale.people]
        );
      }
      await client.query('COMMIT');
      return res.json({
        success: true,
        data: await loadDay(pool, req.j360EstablishmentId, serviceDate),
        message: null,
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (missingTable(err)) return fail(res, 503, 'Rode a migration da meta de sábado.');
      console.error('[justino360] saturday sales sheet:', err.message);
      return fail(res, 500, 'Falha ao salvar as vendas.');
    } finally {
      client.release();
    }
  });

  router.delete('/saturday/sales/:id', requireManage, async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return fail(res, 400, 'Venda inválida.');
    try {
      const removed = await pool.query(
        `DELETE FROM j360_saturday_sales s
          USING j360_saturday_days d
          WHERE s.id = $1 AND s.day_id = d.id AND d.establishment_id = $2
          RETURNING d.service_date`,
        [id, req.j360EstablishmentId]
      );
      if (!removed.rows[0]) return fail(res, 404, 'Venda não encontrada.');
      const serviceDate = String(removed.rows[0].service_date).slice(0, 10);
      return res.json({
        success: true,
        data: await loadDay(pool, req.j360EstablishmentId, serviceDate),
        message: null,
      });
    } catch (err) {
      console.error('[justino360] saturday sale delete:', err.message);
      return fail(res, 500, 'Falha ao remover a venda.');
    }
  });

  return router;
};

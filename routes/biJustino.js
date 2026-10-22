// BI Seu Justino — agregados de reserva. Não grava planilha nesta versão.
const express = require('express');

const CREATE_SNAPSHOTS_TABLE = `
  CREATE TABLE IF NOT EXISTS bi_sheet_snapshots (
    id BIGSERIAL PRIMARY KEY,
    establishment_id INTEGER,
    source TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

const CREATE_SNAPSHOTS_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_bi_sheet_snapshots_source_captured
    ON bi_sheet_snapshots (source, captured_at DESC)
`;

const INACTIVE_STATUSES = [
  'cancelled', 'CANCELADA', 'CANCELED', 'CANCELLED',
  'completed', 'COMPLETED', 'CONCLUIDA', 'CONCLUÍDA', 'FINALIZADA', 'FINALIZED',
  'no_show', 'NO_SHOW', 'NO-SHOW',
];

function todayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year').value;
  const month = parts.find((part) => part.type === 'month').value;
  const day = parts.find((part) => part.type === 'day').value;
  return `${year}-${month}-${day}`;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map((piece) => Number(piece));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function emptyResumo(date, note) {
  const body = {
    ok: true,
    establishment: 'Seu Justino',
    date,
    reservations: { total: 0, people: 0, byStatus: [] },
    checkins: { total: null },
  };
  if (note) body.note = note;
  return body;
}

module.exports = (pool) => {
  const router = express.Router();
  let snapshotsReady = false;
  let ensurePromise = null;

  const ensureSnapshotsTable = () => {
    if (snapshotsReady) return Promise.resolve();
    if (ensurePromise) return ensurePromise;

    ensurePromise = pool
      .query(CREATE_SNAPSHOTS_TABLE)
      .then(() => pool.query(CREATE_SNAPSHOTS_INDEX))
      .then(() => {
        snapshotsReady = true;
      })
      .catch((err) => {
        const message = err && err.message ? err.message : String(err);
        console.warn('[bi-justino] falha ao criar bi_sheet_snapshots:', message);
      })
      .finally(() => {
        ensurePromise = null;
      });

    return ensurePromise;
  };

  ensureSnapshotsTable();

  async function findJustinoIds() {
    const pattern = '%justino%';
    const places = await pool.query(
      `SELECT id
       FROM places
       WHERE name ILIKE $1 OR slug ILIKE $1`,
      [pattern]
    );
    const rows = places.rows.length
      ? places.rows
      : (
          await pool.query(
            `SELECT id
             FROM bars
             WHERE name ILIKE $1 OR slug ILIKE $1`,
            [pattern]
          )
        ).rows;

    return [...new Set(
      rows
        .map((row) => Number(row.id))
        .filter((id) => Number.isInteger(id))
    )];
  }

  router.get('/health', (req, res) => {
    res.json({ ok: true, service: 'bi-justino' });
  });

  router.get('/justino/resumo', async (req, res) => {
    const rawDate = req.query.date;
    const date = rawDate == null || String(rawDate).trim() === ''
      ? todayInSaoPaulo()
      : String(rawDate).trim();

    if (!isIsoDate(date)) {
      return res.status(400).json({ ok: false, error: 'data_invalida' });
    }

    let establishmentIds = [];

    try {
      await ensureSnapshotsTable();
      establishmentIds = await findJustinoIds();

      if (establishmentIds.length === 0) {
        return res.json(emptyResumo(date, 'estabelecimento_nao_encontrado'));
      }

      const statusPlaceholders = INACTIVE_STATUSES
        .map((_, index) => `$${index + 3}`)
        .join(', ');

      const result = await pool.query(
        `SELECT status,
                COUNT(*)::int AS total,
                COALESCE(SUM(number_of_people), 0)::int AS people
         FROM restaurant_reservations
         WHERE establishment_id = ANY($1::int[])
           AND reservation_date = $2::date
           AND status NOT IN (${statusPlaceholders})
         GROUP BY status
         ORDER BY status`,
        [establishmentIds, date, ...INACTIVE_STATUSES]
      );

      const byStatus = result.rows.map((row) => ({
        status: row.status == null ? '' : String(row.status),
        total: Number(row.total) || 0,
        people: Number(row.people) || 0,
      }));

      const total = byStatus.reduce((sum, row) => sum + row.total, 0);
      const people = byStatus.reduce((sum, row) => sum + row.people, 0);

      return res.json({
        ok: true,
        establishment: 'Seu Justino',
        date,
        reservations: { total, people, byStatus },
        checkins: { total: null },
      });
    } catch (err) {
      console.error('[bi-justino] falha ao ler reservas', {
        establishment_id: establishmentIds,
        date,
        message: err && err.message ? err.message : String(err),
      });
      return res.status(500).json({ ok: false, error: 'falha_ao_ler_reservas' });
    }
  });

  return router;
};

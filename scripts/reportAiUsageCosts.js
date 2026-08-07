/**
 * Relatório de custo OpenAI vs conversão (pré-reservas).
 *
 * Uso:
 *   node scripts/reportAiUsageCosts.js
 *   node scripts/reportAiUsageCosts.js --days=7 --establishment=7
 *
 * Mostra % de turnos faq_direct/offline (0 tokens), tokens médios e
 * custo estimado / conversa e / reserva criada no período.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../config/database');

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const m = String(arg).match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [arg.replace(/^--/, ''), true];
  })
);

const DAYS = Math.max(1, Number(args.days) || 7);
const ESTABLISHMENT_ID = Number(args.establishment) || null;

/** Preços aproximados USD / 1M tokens (ajuste via env se necessário). */
const PRICE = {
  'gpt-5.5': {
    in: Number(process.env.PRICE_GPT55_IN || 1.25),
    out: Number(process.env.PRICE_GPT55_OUT || 10),
  },
  'gpt-4o-mini': {
    in: Number(process.env.PRICE_MINI_IN || 0.15),
    out: Number(process.env.PRICE_MINI_OUT || 0.6),
  },
  'gpt-4o': {
    in: Number(process.env.PRICE_4O_IN || 2.5),
    out: Number(process.env.PRICE_4O_OUT || 10),
  },
  none: { in: 0, out: 0 },
};

function estimateUsd(model, promptTokens, completionTokens) {
  const key = String(model || '')
    .toLowerCase()
    .replace(/[^a-z0-9.\-]/g, '');
  let rates = PRICE.none;
  if (key.includes('4o-mini') || key.includes('mini')) rates = PRICE['gpt-4o-mini'];
  else if (key.includes('gpt-5')) rates = PRICE['gpt-5.5'];
  else if (key.includes('4o')) rates = PRICE['gpt-4o'];
  const prompt = Number(promptTokens) || 0;
  const completion = Number(completionTokens) || 0;
  return (prompt * rates.in + completion * rates.out) / 1_000_000;
}

function pct(part, total) {
  if (!total) return '0%';
  return `${((part / total) * 100).toFixed(1)}%`;
}

async function main() {
  const client = await pool.connect();
  try {
    const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
    const params = [since];
    let estFilter = '';
    if (Number.isFinite(ESTABLISHMENT_ID) && ESTABLISHMENT_ID > 0) {
      params.push(ESTABLISHMENT_ID);
      estFilter = ` AND establishment_id = $${params.length}`;
    }

    const usage = await client.query(
      `SELECT
         path,
         model,
         COUNT(*)::int AS events,
         COALESCE(SUM(prompt_tokens), 0)::bigint AS prompt_tokens,
         COALESCE(SUM(completion_tokens), 0)::bigint AS completion_tokens,
         COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
         COUNT(DISTINCT conversation_id)::int AS conversations,
         COUNT(DISTINCT wa_id)::int AS wa_ids
       FROM openai_usage_events
       WHERE created_at >= $1${estFilter}
       GROUP BY path, model
       ORDER BY total_tokens DESC, events DESC`,
      params
    );

    const byPath = await client.query(
      `SELECT
         path,
         COUNT(*)::int AS events,
         COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
         COUNT(DISTINCT COALESCE(conversation_id::text, wa_id, id::text))::int AS approx_turns
       FROM openai_usage_events
       WHERE created_at >= $1${estFilter}
       GROUP BY path
       ORDER BY events DESC`,
      params
    );

    let reservationsCreated = 0;
    try {
      const resParams = [since];
      let resFilter = '';
      if (Number.isFinite(ESTABLISHMENT_ID) && ESTABLISHMENT_ID > 0) {
        resParams.push(ESTABLISHMENT_ID);
        resFilter = ` AND place_id = $${resParams.length}`;
      }
      const res = await client.query(
        `SELECT COUNT(*)::int AS n
         FROM restaurant_reservations
         WHERE created_at >= $1
           AND deleted_at IS NULL
           ${resFilter}`,
        resParams
      );
      reservationsCreated = Number(res.rows[0]?.n) || 0;
    } catch (_error) {
      // schema pode variar; relatório de usage ainda vale
      reservationsCreated = null;
    }

    let totalEvents = 0;
    let totalTokens = 0;
    let totalUsd = 0;
    let zeroTokenEvents = 0;
    const pathBreakdown = {};

    for (const row of usage.rows) {
      const usd = estimateUsd(row.model, row.prompt_tokens, row.completion_tokens);
      totalEvents += row.events;
      totalTokens += Number(row.total_tokens) || 0;
      totalUsd += usd;
      if (row.path === 'faq_direct' || row.path === 'offline' || Number(row.total_tokens) === 0) {
        if (row.path === 'faq_direct' || row.path === 'offline') {
          zeroTokenEvents += row.events;
        }
      }
      if (!pathBreakdown[row.path]) {
        pathBreakdown[row.path] = { events: 0, tokens: 0, usd: 0 };
      }
      pathBreakdown[row.path].events += row.events;
      pathBreakdown[row.path].tokens += Number(row.total_tokens) || 0;
      pathBreakdown[row.path].usd += usd;
    }

    const convApprox = Math.max(
      ...byPath.rows.map((r) => Number(r.approx_turns) || 0),
      1
    );

    console.log('\n=== Relatório custo IA (WhatsApp) ===');
    console.log(`Período: últimos ${DAYS} dia(s)${ESTABLISHMENT_ID ? ` | casa ${ESTABLISHMENT_ID}` : ''}`);
    console.log(`Eventos: ${totalEvents} | Tokens: ${totalTokens} | USD estimado: $${totalUsd.toFixed(4)}`);
    console.log(
      `Camada 1 (faq_direct/offline): ${zeroTokenEvents} eventos (${pct(zeroTokenEvents, totalEvents)})`
    );
    console.log(`Tokens médios / evento: ${totalEvents ? (totalTokens / totalEvents).toFixed(1) : 0}`);
    console.log(`Custo estimado / conversa (aprox): $${(totalUsd / convApprox).toFixed(4)}`);
    if (reservationsCreated != null) {
      console.log(`Pré-reservas criadas no período: ${reservationsCreated}`);
      console.log(
        `Custo estimado / reserva: $${
          reservationsCreated > 0 ? (totalUsd / reservationsCreated).toFixed(4) : 'n/a'
        }`
      );
    }

    console.log('\nPor path:');
    for (const [pathName, data] of Object.entries(pathBreakdown).sort(
      (a, b) => b[1].usd - a[1].usd
    )) {
      console.log(
        `  ${pathName}: events=${data.events} tokens=${data.tokens} usd=$${data.usd.toFixed(4)} (${pct(
          data.events,
          totalEvents
        )})`
      );
    }

    console.log('\nDetalhe path×model:');
    for (const row of usage.rows) {
      const usd = estimateUsd(row.model, row.prompt_tokens, row.completion_tokens);
      console.log(
        `  ${row.path} | ${row.model || '-'} | events=${row.events} tokens=${row.total_tokens} usd=$${usd.toFixed(4)}`
      );
    }
    console.log('');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Falha no relatório:', err.message);
  process.exit(1);
});

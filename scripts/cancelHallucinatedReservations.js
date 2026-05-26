#!/usr/bin/env node
/**
 * Cancela reservas fantasmas criadas pela IA com dados alucinados.
 *
 * Heurísticas de "fantasma":
 *   - reservation_date depois de 2026-12-31 (LLM inventou ano 2027)
 *   - OU area_id é NULL/area_label suspeita (Terraço, etc.) ainda no banco
 *   - E criada nas últimas N horas (por segurança, não toca reservas antigas)
 *
 * Modos:
 *   node scripts/cancelHallucinatedReservations.js              # dry-run
 *   node scripts/cancelHallucinatedReservations.js --execute    # aplica
 *   node scripts/cancelHallucinatedReservations.js --hours=24   # janela
 *   node scripts/cancelHallucinatedReservations.js --establishment-id=7
 *
 * Por padrão: estabelecimento 7 (Highline), últimas 6 horas, dry-run.
 */

require('dotenv').config();
const pool = require('../config/database');

const args = process.argv.slice(2);
const isExecute = args.includes('--execute');
const hoursArg = args.find((a) => a.startsWith('--hours='));
const hours = hoursArg ? Number(hoursArg.split('=')[1]) : 6;
const estArg = args.find((a) => a.startsWith('--establishment-id='));
const establishmentId = estArg ? Number(estArg.split('=')[1]) : 7;

if (!Number.isFinite(hours) || hours <= 0 || hours > 168) {
  console.error('--hours deve ser entre 1 e 168 (1 semana).');
  process.exit(2);
}

async function main() {
  console.log(
    `\n=== Auditoria de reservas fantasmas ===\n` +
      `Estabelecimento: ${establishmentId}\n` +
      `Janela: últimas ${hours} horas\n` +
      `Modo: ${isExecute ? 'EXECUTAR (aplica mudanças)' : 'DRY-RUN (só mostra o que faria)'}\n`
  );

  // Lista candidatas a fantasma.
  const { rows: candidates } = await pool.query(
    `SELECT
        id,
        client_name,
        client_email,
        TO_CHAR(reservation_date, 'YYYY-MM-DD') AS reservation_date,
        reservation_time,
        table_number,
        area_id,
        area_display_name,
        number_of_people,
        status,
        created_at,
        notes
       FROM restaurant_reservations
      WHERE establishment_id = $1
        AND created_at > NOW() - ($2::int || ' hours')::interval
        AND (
          reservation_date > DATE '2026-12-31'
          OR area_display_name ILIKE '%terra__%'
          OR area_display_name ILIKE '%área coberta%'
          OR area_display_name ILIKE '%área descoberta%'
          OR area_display_name ILIKE '%área vip%'
          OR area_display_name ILIKE '%balcão%'
          OR notes ILIKE '%terra__%'
        )
        AND status NOT IN ('CANCELADA', 'CANCELLED')
      ORDER BY created_at DESC`,
    [establishmentId, hours]
  );

  if (candidates.length === 0) {
    console.log('Nenhuma reserva fantasma detectada nessa janela. Nada a cancelar.');
    process.exit(0);
  }

  console.log(`Encontradas ${candidates.length} reserva(s) suspeita(s):\n`);
  for (const r of candidates) {
    console.log(
      ` - id=${r.id} | ${r.client_name || '(sem nome)'} | ${r.client_email || '(sem email)'} | ` +
        `${r.reservation_date} ${String(r.reservation_time || '').slice(0, 5)} | ` +
        `area_id=${r.area_id || 'NULL'} (${r.area_display_name || 'sem label'}) | ` +
        `mesa=${r.table_number || 'NULL'} | qtd=${r.number_of_people} | status=${r.status} | ` +
        `criada em ${new Date(r.created_at).toISOString()}`
    );
  }

  if (!isExecute) {
    console.log(
      `\n⚠️  Dry-run apenas. Para CANCELAR essas ${candidates.length} reserva(s), rode novamente com --execute:\n` +
        `   node scripts/cancelHallucinatedReservations.js --execute --hours=${hours} --establishment-id=${establishmentId}\n`
    );
    process.exit(0);
  }

  // Executa cancelamento.
  const ids = candidates.map((r) => r.id);
  const { rows: updated } = await pool.query(
    `UPDATE restaurant_reservations
        SET status = 'CANCELADA',
            notes = COALESCE(notes, '') ||
              ' [CANCELADA AUTO ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI') ||
              ': IA gerou com dados alucinados (data ou área inválida)]'
      WHERE id = ANY($1::int[])
      RETURNING id`,
    [ids]
  );

  console.log(`\n✅ ${updated.length} reserva(s) marcada(s) como CANCELADA.`);
  console.log('Listagem dos IDs cancelados:', updated.map((r) => r.id).join(', '));
  process.exit(0);
}

main()
  .catch((err) => {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  })
  .finally(() => {
    try {
      pool.end();
    } catch (_e) {
      /* noop */
    }
  });

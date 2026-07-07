'use strict';

/**
 * Backfill de recuperação — fluxo promoter/check-in (multi-tenant).
 *
 * Corrige dados que ficaram "presos" por causa do bug de organization_id:
 *   - Vínculos promoter↔evento sem `listas` (o INSERT da lista era rejeitado pelo RLS).
 *   - Convidados de `promoter_convidados` que nunca chegaram em `listas_convidados`
 *     (por falta de lista no momento do cadastro público).
 *
 * O que faz (idempotente):
 *   1. Para cada `promoter_convidados` com evento_id, garante que exista uma `listas`
 *      para (promoter, evento) — cria com `organization_id` do promoter se faltar.
 *   2. Insere o convidado em `listas_convidados` (com `organization_id`) se ainda não
 *      estiver lá (dedupe por lista_id + nome + telefone).
 *
 * SEGURANÇA:
 *   - Dry-run por padrão: só imprime o que faria. Nada é gravado.
 *   - Para aplicar de verdade: --apply
 *   - Filtro opcional por evento: --evento=347
 *   - Usa app.bypass_rls para escrever entre organizações com segurança.
 *
 * Uso:
 *   node scripts/saas/backfill_promoter_listas_convidados.js            # dry-run (tudo)
 *   node scripts/saas/backfill_promoter_listas_convidados.js --evento=347
 *   node scripts/saas/backfill_promoter_listas_convidados.js --evento=347 --apply
 */

const pool = require('../../config/database');

function parseArgs(argv) {
  const args = { apply: false, evento: null };
  for (const a of argv.slice(2)) {
    if (a === '--apply') args.apply = true;
    else if (a.startsWith('--evento=')) args.evento = a.split('=')[1];
  }
  return args;
}

async function main() {
  const { apply, evento } = parseArgs(process.argv);
  const mode = apply ? 'APPLY (gravando)' : 'DRY-RUN (somente leitura)';
  console.log(`\n🧩 Backfill promoter → listas_convidados — modo: ${mode}`);
  if (evento) console.log(`   Filtro: evento_id = ${evento}`);

  const client = await pool.connect();
  let listasCriadas = 0;
  let convidadosInseridos = 0;
  let jaExistiam = 0;

  try {
    await client.query('BEGIN');
    // Escrever entre organizações com segurança (bypass RLS só nesta transação).
    await client.query(`SELECT set_config('app.bypass_rls', 'on', true)`);

    const params = [];
    let where = 'pc.evento_id IS NOT NULL';
    if (evento) {
      params.push(evento);
      where += ` AND pc.evento_id = $${params.length}`;
    }

    const convidados = await client.query(
      `SELECT pc.id, pc.promoter_id, pc.evento_id, pc.nome, pc.whatsapp, pc.vip_tipo,
              p.nome AS promoter_nome, p.organization_id AS promoter_org
         FROM meu_backup_db.promoter_convidados pc
         JOIN meu_backup_db.promoters p ON p.promoter_id = pc.promoter_id
        WHERE ${where}
        ORDER BY pc.promoter_id, pc.evento_id, pc.nome`,
      params,
    );

    console.log(`\n📋 Convidados de promoter com evento: ${convidados.rows.length}\n`);

    // cache de lista por (promoter, evento)
    const listaCache = new Map();

    for (const c of convidados.rows) {
      const cacheKey = `${c.promoter_id}:${c.evento_id}`;
      let lista = listaCache.get(cacheKey);

      if (!lista) {
        const found = await client.query(
          `SELECT lista_id, organization_id FROM meu_backup_db.listas
            WHERE promoter_responsavel_id = $1 AND evento_id = $2 LIMIT 1`,
          [c.promoter_id, c.evento_id],
        );
        if (found.rows.length > 0) {
          lista = found.rows[0];
        } else {
          const nomeLista = `Lista de ${c.promoter_nome}`;
          console.log(`   + Lista faltante: promoter ${c.promoter_id} (${c.promoter_nome}) evento ${c.evento_id}`);
          if (apply) {
            const created = await client.query(
              `INSERT INTO meu_backup_db.listas
                 (evento_id, promoter_responsavel_id, nome, tipo, observacoes, organization_id)
               VALUES ($1, $2, $3, 'Promoter', 'Lista recuperada (backfill)', $4)
               RETURNING lista_id, organization_id`,
              [c.evento_id, c.promoter_id, nomeLista, c.promoter_org],
            );
            lista = created.rows[0];
          } else {
            lista = { lista_id: null, organization_id: c.promoter_org };
          }
          listasCriadas += 1;
        }
        listaCache.set(cacheKey, lista);
      }

      const orgId = lista.organization_id != null ? lista.organization_id : c.promoter_org;

      // Dedupe em listas_convidados (só possível se a lista já existe / foi criada)
      if (lista.lista_id != null) {
        const existe = await client.query(
          c.whatsapp
            ? `SELECT lista_convidado_id FROM meu_backup_db.listas_convidados
                 WHERE lista_id = $1 AND nome_convidado = $2 AND telefone_convidado = $3 LIMIT 1`
            : `SELECT lista_convidado_id FROM meu_backup_db.listas_convidados
                 WHERE lista_id = $1 AND nome_convidado = $2
                   AND (telefone_convidado IS NULL OR telefone_convidado = '') LIMIT 1`,
          c.whatsapp ? [lista.lista_id, c.nome, c.whatsapp] : [lista.lista_id, c.nome],
        );
        if (existe.rows.length > 0) {
          jaExistiam += 1;
          continue;
        }
      }

      const vip = c.vip_tipo === 'M' || c.vip_tipo === 'F' ? c.vip_tipo : null;
      console.log(`   → Convidado: "${c.nome}" → lista ${lista.lista_id ?? '(nova)'} (org ${orgId})`);
      if (apply && lista.lista_id != null) {
        try {
          await client.query(
            `INSERT INTO meu_backup_db.listas_convidados
               (lista_id, nome_convidado, telefone_convidado, status_checkin, is_vip, vip_tipo, organization_id)
             VALUES ($1, $2, $3, 'Pendente', $4, $5, $6)`,
            [lista.lista_id, c.nome, c.whatsapp || null, !!vip, vip, orgId],
          );
        } catch (err) {
          if (err.code === '42703') {
            await client.query(
              `INSERT INTO meu_backup_db.listas_convidados
                 (lista_id, nome_convidado, telefone_convidado, status_checkin, is_vip, organization_id)
               VALUES ($1, $2, $3, 'Pendente', $4, $5)`,
              [lista.lista_id, c.nome, c.whatsapp || null, !!vip, orgId],
            );
          } else {
            throw err;
          }
        }
      }
      convidadosInseridos += 1;
    }

    if (apply) {
      await client.query('COMMIT');
      console.log('\n✅ APLICADO (COMMIT).');
    } else {
      await client.query('ROLLBACK');
      console.log('\nℹ️ DRY-RUN (ROLLBACK) — nada foi gravado. Rode com --apply para efetivar.');
    }

    console.log('\n📊 Resumo:');
    console.log(`   Listas ${apply ? 'criadas' : 'a criar'}: ${listasCriadas}`);
    console.log(`   Convidados ${apply ? 'inseridos' : 'a inserir'}: ${convidadosInseridos}`);
    console.log(`   Já existiam em listas_convidados: ${jaExistiam}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n❌ Erro no backfill:', err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

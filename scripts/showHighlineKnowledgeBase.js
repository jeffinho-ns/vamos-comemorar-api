/**
 * Imprime EXATAMENTE o que a IA recebe como "Treinamento da IA — Regras da
 * Casa" do HighLine quando vai gerar uma resposta.
 *
 * Usado para auditar visualmente o que está no painel admin chegando ao LLM:
 *   - Quais tópicos estão ativos
 *   - Qual o texto exato de cada um
 *   - Tamanho total (chars) — relevante para verificar se cabe no contexto
 *   - Eventuais duplicatas ou contradições
 *
 * Uso:
 *   DATABASE_URL=postgresql://... node scripts/showHighlineKnowledgeBase.js
 *   ou
 *   node scripts/showHighlineKnowledgeBase.js
 *   (se .env já tem DATABASE_URL apontando pra prod)
 *
 * Read-only — apenas SELECT.
 */
require('dotenv').config();
const { Pool } = require('pg');
const {
  loadAllActiveFaqsForEstablishment,
  buildFaqKnowledgeBlock,
} = require('../services/agent/faqPrefetchService');

const HIGHLINE_ID = 7;
const HIGHLINE_NAME = 'HighLine';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL não definido. Configure no .env ou exporte na sessão.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log('='.repeat(80));
  console.log('TREINAMENTO DA IA — REGRAS DA CASA DO HIGHLINE');
  console.log(`(o que a IA recebe no prompt ANTES de gerar cada resposta — establishment_id=${HIGHLINE_ID})`);
  console.log('='.repeat(80));
  console.log();

  const entries = await loadAllActiveFaqsForEstablishment(pool, HIGHLINE_ID, {
    maxChars: 16000,
  });

  if (entries.length === 0) {
    console.log('⚠️  NENHUMA ENTRADA ATIVA encontrada para o Highline.');
    console.log('    A IA vai cair no fallback "vou confirmar com a equipe" pra tudo.');
    console.log('    Cadastre regras no painel admin → Treinamento da IA → Regras da Casa.');
    await pool.end();
    return;
  }

  console.log(`Total de entradas ativas: ${entries.length}`);
  console.log();

  const block = buildFaqKnowledgeBlock(entries, HIGHLINE_NAME);
  console.log(`Tamanho do bloco final (chars): ${block.length}`);
  console.log(`Tamanho do bloco final (tokens aprox): ~${Math.ceil(block.length / 4)}`);
  console.log();

  console.log('---- ÍNDICE DE TÓPICOS ATIVOS ----');
  entries.forEach((entry, idx) => {
    const updatedAt = entry.updatedAt
      ? new Date(entry.updatedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      : '(sem data)';
    console.log(
      `${String(idx + 1).padStart(2, '0')}. ${entry.topic} (atualizado: ${updatedAt})`
    );
  });
  console.log();

  console.log('---- BLOCO COMPLETO ENVIADO AO LLM (igual ao que a IA "estuda") ----');
  console.log();
  console.log(block);
  console.log();
  console.log('---- FIM DO BLOCO ----');
  console.log();

  // Detector simples de problemas comuns
  console.log('---- AUDITORIA AUTOMÁTICA ----');
  const issues = [];

  const topicNames = entries.map((e) => e.topic);
  const duplicates = topicNames.filter((t, i) => topicNames.indexOf(t) !== i);
  if (duplicates.length) {
    issues.push(`Tópicos duplicados: ${[...new Set(duplicates)].join(', ')}`);
  }

  const blockLower = block.toLowerCase();
  if (blockLower.includes('bar central')) {
    issues.push('"Bar Central" ainda aparece em alguma entrada — esse nome não existe na casa, deveria ser "Área Bar".');
  }
  if (blockLower.includes('terraço') || blockLower.includes('terraco')) {
    issues.push('"Terraço" aparece em alguma entrada — não é uma área válida do Highline.');
  }
  if (blockLower.includes('balcão') || blockLower.includes('balcao')) {
    if (!blockLower.includes('área balcão') && !blockLower.includes('area balcao')) {
      issues.push('"Balcão" aparece como nome de área — não é uma área válida do Highline.');
    }
  }
  if (block.length > 12000) {
    issues.push(`Bloco com ${block.length} chars está grande — pode ser cortado por maxChars em produção. Considere consolidar entradas.`);
  }

  if (issues.length === 0) {
    console.log('✓ Nenhum problema óbvio detectado.');
  } else {
    issues.forEach((issue, idx) => {
      console.log(`${idx + 1}. ⚠️  ${issue}`);
    });
  }

  await pool.end();
}

main().catch((error) => {
  console.error('Erro:', error.message);
  if (process.env.DEBUG) console.error(error.stack);
  pool.end().catch(() => {});
  process.exit(1);
});

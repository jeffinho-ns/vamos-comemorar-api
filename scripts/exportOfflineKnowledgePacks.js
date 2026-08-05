require('dotenv').config();

const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

const OFFLINE_KNOWLEDGE_DIR = path.join(__dirname, '../data/offline-knowledge');

const INTERNAL_FAQ_TOPICS = new Set([
  'prioridade_treinamento_ia',
  'tom_atendimento_humano',
  'coleta_dados_progressiva_reserva',
  'primeiro_contato_anuncio',
  'subareas_canonicas_highline',
  'controle_duplicidade_reservas',
  'capacidade_diaria_highline',
  'reserva_grupos_grandes_highline',
  'reserva_areas_operacional_highline',
  'valor_entrada_vs_caucao',
]);

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function slugFromName(name) {
  const normalized = normalizeText(name);
  if (!normalized) return '';
  return normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function looksLikeInternalTrainingAnswer(answer) {
  const text = String(answer || '').trim();
  if (!text) return true;
  return /^(REGRA|META-REGRA)\b/i.test(text);
}

function isCustomerFacingRow(row) {
  const topic = String(row?.topic || '').trim();
  const answer = String(row?.answer || '').trim();
  if (!topic || !answer) return false;
  if (INTERNAL_FAQ_TOPICS.has(topic)) return false;
  if (looksLikeInternalTrainingAnswer(answer)) return false;
  return true;
}

async function tableExists(client, tableName) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.tables
        WHERE table_schema IN ('meu_backup_db', 'public')
          AND table_name = $1
     ) AS exists`,
    [tableName]
  );
  return Boolean(result.rows[0]?.exists);
}

async function loadEstablishmentFaqs(client) {
  const hasTable = await tableExists(client, 'establishment_faq');
  if (!hasTable) {
    console.warn('[exportOfflineKnowledgePacks] tabela establishment_faq não encontrada; nada a exportar.');
    return [];
  }

  const result = await client.query(
    `SELECT
       ef.establishment_id,
       ef.topic,
       ef.answer,
       p.name AS place_name
     FROM establishment_faq ef
     LEFT JOIN places p ON p.id = ef.establishment_id
    WHERE ef.is_active = TRUE
    ORDER BY ef.establishment_id, ef.topic`
  );

  const byEstablishment = new Map();
  for (const row of result.rows) {
    if (!isCustomerFacingRow(row)) continue;

    const establishmentId = Number(row.establishment_id);
    if (!Number.isFinite(establishmentId) || establishmentId <= 0) continue;

    if (!byEstablishment.has(establishmentId)) {
      byEstablishment.set(establishmentId, {
        establishmentId,
        name: row.place_name || null,
        topics: [],
      });
    }

    const pack = byEstablishment.get(establishmentId);
    if (row.place_name && !pack.name) {
      pack.name = row.place_name;
    }

    pack.topics.push({
      topic: String(row.topic || '').trim(),
      answer: String(row.answer || '').trim(),
    });
  }

  return [...byEstablishment.values()];
}

function buildPackPayload(pack) {
  const slug = slugFromName(pack.name) || `establishment_${pack.establishmentId}`;
  return {
    establishmentId: pack.establishmentId,
    slug,
    name: pack.name || `Estabelecimento ${pack.establishmentId}`,
    topics: pack.topics,
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const packs = await loadEstablishmentFaqs(pool);

  if (!packs.length) {
    console.log(JSON.stringify({ apply, packs: 0, message: 'Nenhum FAQ ativo encontrado.' }, null, 2));
    await pool.end();
    return;
  }

  const summary = [];

  for (const pack of packs) {
    const payload = buildPackPayload(pack);
    const fileName = `${pack.establishmentId}.json`;
    const filePath = path.join(OFFLINE_KNOWLEDGE_DIR, fileName);

    summary.push({
      establishmentId: pack.establishmentId,
      name: payload.name,
      slug: payload.slug,
      topics: payload.topics.length,
      file: fileName,
    });

    if (apply) {
      fs.mkdirSync(OFFLINE_KNOWLEDGE_DIR, { recursive: true });
      fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    }
  }

  console.log(
    JSON.stringify(
      {
        apply,
        mode: apply ? 'write' : 'dry-run',
        packs: summary.length,
        files: summary,
      },
      null,
      2
    )
  );

  await pool.end();
}

main().catch(async (error) => {
  console.error(error.message);
  try {
    await pool.end();
  } catch (_error) {
    // ignore
  }
  process.exit(1);
});

'use strict';

/**
 * Fluxo Isa: item de checklist marcado como NÃO OK gera ocorrência e tarefa de correção.
 * Reresposta do mesmo item atualiza o registro existente em vez de duplicar.
 * Recebe o `client` da transação aberta pelo chamador.
 */
async function registerNonConformity(client, params) {
  const {
    establishmentId,
    runItemId,
    sectorId,
    itemTitle,
    observation,
    evidenceUrl,
    priority,
    assignedTo,
    dueAt,
    actorId,
    createTask,
  } = params;

  const existingInc = await client.query(
    `SELECT * FROM j360_incidents
      WHERE checklist_run_item_id = $1 AND establishment_id = $2 AND status <> 'cancelada'
      ORDER BY created_at DESC LIMIT 1`,
    [runItemId, establishmentId]
  );

  let incident;
  if (existingInc.rows[0]) {
    const upd = await client.query(
      `UPDATE j360_incidents
          SET description = $1,
              evidence_url = COALESCE($2, evidence_url),
              priority = $3,
              updated_at = NOW()
        WHERE id = $4 RETURNING *`,
      [observation, evidenceUrl, priority, existingInc.rows[0].id]
    );
    incident = upd.rows[0];
  } else {
    const ins = await client.query(
      `INSERT INTO j360_incidents
        (establishment_id, sector_id, checklist_run_item_id, title, description, category,
         priority, evidence_url, assigned_to, due_at, created_by, status)
       VALUES ($1,$2,$3,$4,$5,'checklist',$6,$7,$8,$9,$10,'aberta') RETURNING *`,
      [
        establishmentId,
        sectorId,
        runItemId,
        `Não conformidade: ${itemTitle}`,
        observation,
        priority,
        evidenceUrl,
        assignedTo,
        dueAt,
        actorId,
      ]
    );
    incident = ins.rows[0];
  }

  if (!createTask) return { incident, task: null };

  const existingTask = await client.query(
    `SELECT * FROM j360_tasks
      WHERE establishment_id = $1 AND origin = 'ocorrencia' AND origin_id = $2
      ORDER BY created_at DESC LIMIT 1`,
    [establishmentId, incident.id]
  );
  if (existingTask.rows[0]) return { incident, task: existingTask.rows[0] };

  const tk = await client.query(
    `INSERT INTO j360_tasks
      (establishment_id, sector_id, origin, origin_id, title, description, priority,
       assigned_to, due_at, evidence_url, created_by, status)
     VALUES ($1,$2,'ocorrencia',$3,$4,$5,$6,$7,$8,$9,$10,'aberta') RETURNING *`,
    [
      establishmentId,
      sectorId,
      incident.id,
      `Corrigir: ${itemTitle}`,
      observation,
      priority,
      assignedTo,
      dueAt,
      evidenceUrl,
      actorId,
    ]
  );
  return { incident, task: tk.rows[0] };
}

/**
 * Valida as regras de resposta de um item antes de gravar.
 * Retorna `null` quando está tudo certo, ou `{ status, message }` para a resposta HTTP.
 */
function validateAnswer({ status, requiresPhoto, observation, evidenceUrl }) {
  if (status !== 'nao_ok') return null;
  if (!observation || observation.length < 3) {
    return { status: 400, message: 'Descreva a não conformidade (mínimo 3 caracteres).' };
  }
  if (requiresPhoto && !evidenceUrl) {
    return {
      status: 400,
      message: 'Este item exige foto/evidência para ser marcado como NÃO OK.',
    };
  }
  return null;
}

/**
 * Mantém o status da execução coerente com os itens: conclui quando não sobra
 * pendente e reabre quando um item concluído volta a ficar pendente.
 */
async function syncRunStatus(client, { runId, currentStatus, actorId }) {
  const pending = await client.query(
    `SELECT COUNT(*)::int AS c FROM j360_checklist_run_items
      WHERE run_id = $1 AND status = 'pendente'`,
    [runId]
  );
  const pendingCount = pending.rows[0].c;

  if (pendingCount === 0) {
    const done = await client.query(
      `UPDATE j360_checklist_runs
          SET status = 'concluido', completed_by = $1, completed_at = NOW()
        WHERE id = $2 RETURNING status`,
      [actorId, runId]
    );
    return { pendingCount, runStatus: done.rows[0]?.status || currentStatus };
  }

  if (currentStatus === 'concluido') {
    const back = await client.query(
      `UPDATE j360_checklist_runs
          SET status = 'em_andamento', completed_by = NULL, completed_at = NULL
        WHERE id = $1 RETURNING status`,
      [runId]
    );
    return { pendingCount, runStatus: back.rows[0]?.status || currentStatus };
  }

  return { pendingCount, runStatus: currentStatus };
}

module.exports = { registerNonConformity, validateAnswer, syncRunStatus };

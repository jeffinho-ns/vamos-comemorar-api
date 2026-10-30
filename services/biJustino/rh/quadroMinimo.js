'use strict';

/**
 * Quadro mínimo por setor (ação `saveSectorBase`) e decisão de freelancers em lote
 * (ação `decideFreelancerRequestsBatch`) — página RH do painel do Renato.
 */

const { SETORES } = require('./colaborador');

const LIMITE_IDS = 200;

function inteiroMin(valor, minimo, padrao) {
  if (valor === undefined || valor === null || valor === '') return padrao;
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  return Math.max(minimo, Math.round(n));
}

/**
 * Mesma montagem de `saveSectorBaseUI` do HTML: um item por setor com atendimento por pessoa (≥1),
 * brigada padrão (≥0) e limite de brigada (≥0, 0 = sem limite). Setor desconhecido é recusado.
 */
function validarQuadroMinimo(corpo) {
  const f = corpo && typeof corpo === 'object' ? corpo : {};
  if (!Array.isArray(f.rows) || !f.rows.length) return { ok: false, error: 'linhas_ausentes' };
  const rows = [];
  for (const linha of f.rows) {
    const item = linha && typeof linha === 'object' ? linha : {};
    const sector = String(item.sector || '');
    if (!SETORES.includes(sector)) return { ok: false, error: `setor_invalido:${sector || '?'}` };
    const atendimentoPorPessoa = inteiroMin(item.atendimentoPorPessoa, 1, 1);
    const brigadaPadrao = inteiroMin(item.brigadaPadrao, 0, 0);
    const limiteBrigada = inteiroMin(item.limiteBrigada, 0, 0);
    if (atendimentoPorPessoa === null || brigadaPadrao === null || limiteBrigada === null) {
      return { ok: false, error: `valor_invalido:${sector}` };
    }
    rows.push({ sector, atendimentoPorPessoa, brigadaPadrao, limiteBrigada });
  }
  return { ok: true, payload: { rows } };
}

/** Aprovar/recusar pedidos de freelancer selecionados (ids únicos, `approve` booleano, nota opcional). */
function validarDecisaoFreelancers(corpo) {
  const f = corpo && typeof corpo === 'object' ? corpo : {};
  const lista = Array.isArray(f.ids) ? f.ids : (f.id ? [f.id] : []);
  const ids = Array.from(new Set(lista.map((id) => String(id || '').trim()).filter((id) => id && id.length <= 80)));
  if (!ids.length) return { ok: false, error: 'ids_ausentes' };
  if (ids.length > LIMITE_IDS) return { ok: false, error: 'ids_demais' };
  if (typeof f.approve !== 'boolean') return { ok: false, error: 'decisao_invalida' };
  const note = String(f.note || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  return { ok: true, payload: { ids, approve: f.approve, note } };
}

module.exports = {
  validarQuadroMinimo,
  validarDecisaoFreelancers,
};

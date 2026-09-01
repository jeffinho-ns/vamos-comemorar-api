'use strict';

/**
 * Filtros de visibilidade multi-unidade do Ideia RH.
 * Colaborador vê conteúdo de grupo (establishment_id IS NULL) + da(s) sua(s) unidade(s).
 */

/**
 * @param {object} opts
 * @param {string} opts.alias - alias SQL da tabela (ex.: 'a')
 * @param {number} opts.orgParamIndex - índice do organization_id nos params
 * @param {number[]|null} opts.userEstablishmentIds - ids das unidades do usuário
 * @param {boolean} opts.manageAll - gestão RH vê tudo da org
 */
function buildVisibilityClause({ alias, orgParamIndex, userEstablishmentIds, manageAll }) {
  const orgCol = `${alias}.organization_id = $${orgParamIndex}`;
  if (manageAll) {
    return { clause: orgCol, extraParams: [] };
  }
  const ids = Array.isArray(userEstablishmentIds) ? userEstablishmentIds.filter(Boolean) : [];
  if (ids.length === 0) {
    return {
      clause: `${orgCol} AND ${alias}.establishment_id IS NULL`,
      extraParams: [],
    };
  }
  return {
    clause: `${orgCol} AND (${alias}.establishment_id IS NULL OR ${alias}.establishment_id = ANY($PARAM$))`,
    extraParams: [ids],
  };
}

/** Substitui placeholder $PARAM$ pelo índice correto após push nos params. */
function applyVisibilityToWhere(baseWhere, visibility, params) {
  if (visibility.extraParams.length === 0) {
    return [...baseWhere, visibility.clause];
  }
  params.push(visibility.extraParams[0]);
  const clause = visibility.clause.replace('$PARAM$', `$${params.length}`);
  return [...baseWhere, clause];
}

module.exports = {
  buildVisibilityClause,
  applyVisibilityToWhere,
};

'use strict';

/**
 * Justino360 — validação do corpo das rotas de treinamento.
 * Devolve `{ ok: false, message }` para a camada HTTP responder 400 sem
 * espalhar regra de validação dentro do router.
 */

const {
  INVALID_ROLE_MESSAGE,
  INVALID_VALIDITY_MESSAGE,
  pickRoleKey,
  parseValidityDays,
} = require('./trainingRules');
const { str, optionalStr, parseBoolean } = require('../../validators/justino360Validator');

function parseCreatePayload(body = {}) {
  const title = str(body.title, 300);
  if (!title) return { ok: false, message: 'Título obrigatório.' };

  const roleKey = pickRoleKey(body.role_key);
  if (!roleKey.ok) return { ok: false, message: INVALID_ROLE_MESSAGE };

  const validity = parseValidityDays(body.validity_days);
  if (!validity.ok) return { ok: false, message: INVALID_VALIDITY_MESSAGE };

  return {
    ok: true,
    value: {
      title,
      description: optionalStr(body.description, 4000),
      roleKey: roleKey.value,
      contentUrl: optionalStr(body.content_url, 1000),
      contentBody: optionalStr(body.content_body, 20000),
      validityDays: validity.value,
      isMandatory: parseBoolean(body.is_mandatory, true),
    },
  };
}

/**
 * Update parcial: só entra no SET o que o cliente mandou explicitamente,
 * para o PATCH não apagar campo que a tela não conhece.
 */
function parseUpdatePayload(body = {}) {
  const sets = [];
  const params = [];
  const pushSet = (column, value) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };

  if (body.title !== undefined) {
    const title = str(body.title, 300);
    if (!title) return { ok: false, message: 'Título obrigatório.' };
    pushSet('title', title);
  }
  if (body.description !== undefined) pushSet('description', optionalStr(body.description, 4000));
  if (body.content_url !== undefined) pushSet('content_url', optionalStr(body.content_url, 1000));
  if (body.content_body !== undefined) {
    pushSet('content_body', optionalStr(body.content_body, 20000));
  }
  if (body.role_key !== undefined) {
    const roleKey = pickRoleKey(body.role_key);
    if (!roleKey.ok) return { ok: false, message: INVALID_ROLE_MESSAGE };
    pushSet('role_key', roleKey.value);
  }
  if (body.validity_days !== undefined) {
    const validity = parseValidityDays(body.validity_days);
    if (!validity.ok) return { ok: false, message: INVALID_VALIDITY_MESSAGE };
    pushSet('validity_days', validity.value);
  }
  if (body.is_mandatory !== undefined) {
    pushSet('is_mandatory', parseBoolean(body.is_mandatory, true));
  }
  if (body.is_active !== undefined) {
    pushSet('is_active', parseBoolean(body.is_active, true));
  }

  if (sets.length === 0) return { ok: false, message: 'Nenhum campo para atualizar.' };
  return { ok: true, sets, params };
}

module.exports = { parseCreatePayload, parseUpdatePayload };

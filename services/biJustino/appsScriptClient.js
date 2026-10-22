const DEFAULT_URL = 'https://script.google.com/macros/s/AKfycbzsXAoBmnHvfocbC3JWiVtiHaSwkzrCX3hKdtRsz_YRoatP3qrksSOj3J8776S3bJXVuA/exec';

function scriptConfig(env) {
  const source = env || process.env;
  return {
    url: String(source.BI_APPS_SCRIPT_URL || DEFAULT_URL).trim(),
    email: String(source.BI_APPS_SCRIPT_EMAIL || '').trim(),
    password: String(source.BI_APPS_SCRIPT_PASSWORD || ''),
  };
}

function missingCredentialNames(env) {
  const config = scriptConfig(env);
  const missing = [];
  if (!config.email) missing.push('BI_APPS_SCRIPT_EMAIL');
  if (!config.password) missing.push('BI_APPS_SCRIPT_PASSWORD');
  return missing;
}

async function postAction(url, body, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  const response = await doFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
    redirect: 'follow',
  });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    const error = new Error('resposta_invalida');
    error.code = 'resposta_invalida';
    throw error;
  }
}

async function readAction(action, env, fetchImpl) {
  const missing = missingCredentialNames(env);
  if (missing.length) {
    const error = new Error('credenciais_ausentes');
    error.code = 'credenciais_ausentes';
    error.missing = missing;
    throw error;
  }

  const config = scriptConfig(env);
  const login = await postAction(config.url, {
    action: 'login',
    email: config.email,
    password: config.password,
  }, fetchImpl);

  if (!login || !login.ok || !login.token) {
    const error = new Error('login_recusado');
    error.code = 'login_recusado';
    throw error;
  }

  const data = await postAction(config.url, {
    action,
    token: login.token,
  }, fetchImpl);

  if (!data || data.ok === false) {
    const error = new Error('leitura_recusada');
    error.code = data && data.code ? data.code : 'leitura_recusada';
    throw error;
  }

  return data;
}

module.exports = {
  scriptConfig,
  missingCredentialNames,
  readAction,
};

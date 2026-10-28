'use strict';

const { missingCredentialNames } = require('../services/biJustino/appsScriptClient');
const { scheduleZigSync } = require('../services/biJustino/zigOverview');
const { collectDre, faltando } = require('../services/biJustino/dreSharepoint');
const { collectNovidades } = require('../services/biJustino/painelNovidades');

const INTERVALO_MS = Number(process.env.BI_JUSTINO_COLETOR_MS || 5 * 60 * 1000);
const ATRASO_MS = Number(process.env.BI_JUSTINO_COLETOR_ATRASO_MS || 15000);

let timer = null;
let rodando = false;

async function coletarFontes(pool) {
  if (rodando) return;
  rodando = true;
  const loginPainel = missingCredentialNames(process.env);
  console.log('[bi-justino] coleta das planilhas', {
    establishment: 'Seu Justino',
    painel: loginPainel.length ? loginPainel.join(',') : 'ok',
    microsoft: faltando(process.env).length ? 'incompleto' : 'ok',
  });
  try {
    await Promise.all([
      Promise.resolve(scheduleZigSync(pool, process.env)),
      collectDre(pool, process.env),
      collectNovidades(pool, process.env),
    ]);
  } catch (err) {
    console.error('[bi-justino] falha no coletor', {
      message: err && err.message ? err.message : String(err),
    });
  } finally {
    rodando = false;
  }
}

function startBiJustinoCollector(pool) {
  if (process.env.BI_JUSTINO_COLETOR === 'false') return;
  if (timer) return;
  setTimeout(() => { coletarFontes(pool); }, ATRASO_MS);
  timer = setInterval(() => { coletarFontes(pool); }, INTERVALO_MS);
  if (typeof timer.unref === 'function') timer.unref();
  console.log('[bi-justino] coletor do banco iniciado');
}

module.exports = {
  startBiJustinoCollector,
  coletarFontes,
};

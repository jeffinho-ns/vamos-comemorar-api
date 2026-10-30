'use strict';

const { missingCredentialNames } = require('../services/biJustino/appsScriptClient');
const { scheduleZigSync } = require('../services/biJustino/zigOverview');
const { faltando } = require('../services/biJustino/dreSharepoint');
const { coletarAbertura } = require('../services/biJustino/bootstrapColeta');
const { coletarEspelho } = require('../services/biJustino/espelho/coletor');
const { chavesSemCopia } = require('../services/biJustino/espelho/leitura');

const INTERVALO_MS = Number(process.env.BI_JUSTINO_COLETOR_MS || 5 * 60 * 1000);
const ATRASO_MS = Number(process.env.BI_JUSTINO_COLETOR_ATRASO_MS || 15000);
const ESPELHO_LENTO_MS = Number(process.env.BI_JUSTINO_ESPELHO_LENTO_MS || 60 * 60 * 1000);

let timer = null;
let rodando = false;
let ultimoEspelhoLento = 0;

/**
 * Espelho da planilha: o que falta no banco vem inteiro; o que muda no dia vem a cada ciclo;
 * históricos pesados, a cada hora.
 */
async function coletarEspelhoPlanilha(pool) {
  const faltando = await chavesSemCopia(pool).catch(() => []);
  if (faltando.length) {
    await coletarEspelho(pool, process.env, { chaves: faltando });
  }
  await coletarEspelho(pool, process.env, { modo: 'rapido' });
  if (Date.now() - ultimoEspelhoLento >= ESPELHO_LENTO_MS) {
    ultimoEspelhoLento = Date.now();
    await coletarEspelho(pool, process.env, { modo: 'lento' });
  }
}

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
    await Promise.resolve(scheduleZigSync(pool, process.env, { pularPainel: true }));
    await coletarAbertura(pool, process.env);
    await coletarEspelhoPlanilha(pool);
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

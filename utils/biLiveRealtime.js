'use strict';

/** Sala do painel ao vivo do Seu Justino. O payload não leva nome nem número. */

let ioRef = null;

function attachBiLiveRealtime(io) {
  ioRef = io || null;
}

function emitBiLiveChanged(reason) {
  if (!ioRef) return;
  try {
    ioRef.to('bi_justino').emit('bi_justino_changed', {
      reason: reason ? String(reason) : 'alterado',
      at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[bi-justino] emit falhou', { message: err.message });
  }
}

module.exports = {
  attachBiLiveRealtime,
  emitBiLiveChanged,
};

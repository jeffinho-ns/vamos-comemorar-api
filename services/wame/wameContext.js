'use strict';

const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function runWithWame(ctx, fn) {
  return storage.run(ctx && typeof ctx === 'object' ? ctx : { enabled: true }, fn);
}

function currentWame() {
  return storage.getStore() || null;
}

function isWameRequestActive() {
  return Boolean(currentWame()?.enabled);
}

module.exports = {
  runWithWame,
  currentWame,
  isWameRequestActive,
};

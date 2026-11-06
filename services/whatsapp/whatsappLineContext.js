'use strict';

const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function runWithWhatsappLine(line, fn) {
  if (!line || !line.phoneNumberId) return fn();
  return storage.run(
    {
      phoneNumberId: String(line.phoneNumberId),
      accessToken: line.accessToken ? String(line.accessToken) : null,
    },
    fn,
  );
}

function currentWhatsappLine() {
  return storage.getStore() || null;
}

module.exports = {
  runWithWhatsappLine,
  currentWhatsappLine,
};

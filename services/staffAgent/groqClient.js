'use strict';

/**
 * Compat: o Staff Agent migrou de Groq → xAI/Grok.
 * Mantém este módulo para imports antigos; use xaiClient.js.
 */
module.exports = require('./xaiClient');

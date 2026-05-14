const { resolveDateFromText } = require('../nlp/dateResolver');
const { parseQuantityFromText } = require('../nlp/quantityParser');
const { getFieldsForStep } = require('../services/stateManager/conversationSteps');

function extractReservationSlotsFromMessage(messageText) {
  const fields = {};
  const notes = [];

  const parsedDate = resolveDateFromText(messageText);
  if (parsedDate.ok) {
    fields.reservation_date = parsedDate.iso;
    notes.push(`date:${parsedDate.source}`);
  }

  const parsedQuantity = parseQuantityFromText(messageText);
  if (parsedQuantity.ok) {
    fields.quantidade_convidados = parsedQuantity.quantity;
    notes.push(`party_size:${parsedQuantity.source}`);
  }

  const timeMatch = String(messageText || '').match(/\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/);
  if (timeMatch) {
    fields.reservation_time = `${String(timeMatch[1]).padStart(2, '0')}:${timeMatch[2]}`;
    notes.push('time:regex');
  }

  return {
    fields,
    notes,
  };
}

function extractLocalFields({ messageText, currentStep, collectedFields = {} }) {
  const fields = {};
  const notes = [];
  let confidence = 'none';
  let needsLlm = true;

  const stepFields = getFieldsForStep(currentStep);

  if (stepFields.includes('reservation_date') || currentStep === 'date') {
    const parsedDate = resolveDateFromText(messageText);
    if (parsedDate.ok) {
      fields.reservation_date = parsedDate.iso;
      notes.push(`date:${parsedDate.source}`);
      confidence = parsedDate.confidence || 'medium';
      if (parsedDate.confidence === 'high' && !parsedDate.ambiguous) {
        needsLlm = false;
      }
    }
  }

  if (stepFields.includes('quantidade_convidados') || currentStep === 'party_size') {
    const parsedQuantity = parseQuantityFromText(messageText);
    if (parsedQuantity.ok) {
      fields.quantidade_convidados = parsedQuantity.quantity;
      notes.push(`party_size:${parsedQuantity.source}`);
      if (parsedQuantity.confidence === 'high' && !parsedQuantity.ambiguous) {
        confidence = 'high';
        needsLlm = false;
      } else {
        confidence = parsedQuantity.confidence || 'medium';
      }
    }
  }

  if (stepFields.includes('reservation_time') || currentStep === 'time') {
    const timeMatch = String(messageText || '').match(/\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/);
    if (timeMatch) {
      fields.reservation_time = `${String(timeMatch[1]).padStart(2, '0')}:${timeMatch[2]}`;
      notes.push('time:regex');
      confidence = 'high';
      needsLlm = false;
    }
  }

  if (Object.keys(fields).length === 0) {
    return {
      fields,
      confidence: 'none',
      needsLlm: true,
      notes,
    };
  }

  return {
    fields,
    confidence,
    needsLlm,
    notes,
    collectedFields,
  };
}

module.exports = {
  extractLocalFields,
  extractReservationSlotsFromMessage,
};

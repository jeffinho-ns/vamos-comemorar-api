'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isHistoryPayload } = require('../../services/wame/wameCoexistenceHistory');

describe('wameCoexistenceHistory', () => {
  it('reconhece o field history da Meta', () => {
    assert.equal(
      isHistoryPayload({
        entry: [{ changes: [{ field: 'history', value: { history: [] } }] }],
      }),
      true
    );
    assert.equal(
      isHistoryPayload({
        entry: [{ changes: [{ field: 'messages', value: {} }] }],
      }),
      false
    );
  });
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { didEnableHouseAi } = require('../../services/whatsapp/resumeHouseAi');

describe('resumeHouseAi', () => {
  it('só considera religar quando a casa sai de desligada para ligada', () => {
    assert.equal(didEnableHouseAi(false, true), true);
    assert.equal(didEnableHouseAi(true, true), false);
    assert.equal(didEnableHouseAi(true, false), false);
    assert.equal(didEnableHouseAi(false, false), false);
  });
});

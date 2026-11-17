'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { describePhoneReply } = require('../../services/wame/wamePhoneReply');

function payload(message, extra = {}) {
  return {
    entry: [{
      changes: [{
        field: 'messages',
        value: {
          metadata: { display_phone_number: '551152003650', phone_number_id: 'justinoKey1' },
          contacts: [{ wa_id: '5511999998888' }],
          messages: [message],
          ...extra,
        },
      }],
    }],
  };
}

describe('wamePhoneReply', () => {
  it('reconhece a resposta enviada pelo celular do estabelecimento', () => {
    const reply = describePhoneReply(payload({
      from: '5511999998888',
      id: 'wamid.out',
      type: 'text',
      text: { body: '  Pode ser dia 19.  ' },
      from_me: true,
    }));
    assert.deepEqual(reply, {
      waId: '5511999998888',
      body: 'Pode ser dia 19.',
      wamid: 'wamid.out',
      messageType: 'text',
    });
  });

  it('ignora mensagem do cliente e grupo', () => {
    assert.equal(describePhoneReply(payload({
      from: '5511999998888',
      id: 'wamid.in',
      type: 'text',
      text: { body: 'oi' },
    })), null);
    assert.equal(describePhoneReply(payload({
      from: '5511999998888',
      chat_type: 'group',
      id: 'wamid.grp',
      type: 'text',
      text: { body: 'oi' },
      from_me: true,
    })), null);
  });

  it('usa o destinatário quando o eco oficial manda o número da casa em from', () => {
    const reply = describePhoneReply({
      entry: [{
        changes: [{
          field: 'smb_message_echoes',
          value: {
            metadata: { display_phone_number: '551152003650' },
            message_echoes: [{
              from: '551152003650',
              to: '5511967265789',
              id: 'wamid.echo',
              type: 'text',
              text: { body: 'Confirmado' },
            }],
          },
        }],
      }],
    });
    assert.equal(reply.waId, '5511967265789');
    assert.equal(reply.body, 'Confirmado');
  });
});

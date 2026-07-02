'use strict';

const PaymentProvider = require('./PaymentProvider');

/** Cobrança manual (PIX/boleto por fora) — operador registra o pagamento no painel. */
class ManualPaymentProvider extends PaymentProvider {
  get key() {
    return 'manual';
  }

  async createCharge({ invoiceId }) {
    return {
      externalId: null,
      status: 'awaiting_manual',
      receiptUrl: null,
      invoiceId,
    };
  }
}

module.exports = ManualPaymentProvider;

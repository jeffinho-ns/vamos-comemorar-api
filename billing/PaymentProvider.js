'use strict';

/**
 * Interface de provedor de pagamento (gateway-ready).
 * Implementações: ManualPaymentProvider (Fase 5), Stripe/Asaas depois.
 */
class PaymentProvider {
  /** @returns {string} */
  get key() {
    throw new Error('PaymentProvider.key não implementado');
  }

  /**
   * @param {{ invoiceId: number, amountCents: number, metadata?: object }} _params
   * @returns {Promise<{ externalId: string|null, status: string, receiptUrl?: string }>}
   */
  async createCharge(_params) {
    throw new Error('PaymentProvider.createCharge não implementado');
  }

  /**
   * @param {object} _payload
   * @returns {Promise<{ invoiceId: number, status: string }|null>}
   */
  async handleWebhook(_payload) {
    return null;
  }
}

module.exports = PaymentProvider;

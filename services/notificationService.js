// services/notificationService.js
const { Resend } = require('resend');

class NotificationService {
  constructor() {
    // Inicia o cliente do Resend com a chave de API das variáveis de ambiente
    if (process.env.RESEND_API_KEY) {
      this.resend = new Resend(process.env.RESEND_API_KEY);
      console.log('✅ Serviço de e-mail (Resend) configurado.');
    } else {
      console.warn('⚠️ AVISO: RESEND_API_KEY não foi encontrada. O serviço de e-mail está desativado.');
      this.resend = null;
    }

    // Configuração do WhatsApp (mantida como está para uso futuro)
    this.whatsappClient = null;
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      const twilio = require('twilio');
      this.whatsappClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
    }
  }

  /**
   * Envia email de confirmação para o cliente (funciona para reservas normais e grandes)
   */
  async sendReservationConfirmationEmail(reservation) {
    if (!this.resend) return { success: false, error: 'Serviço de e-mail não configurado.' };
    
    const { client_name, client_email, reservation_date, reservation_time, number_of_people, area_name, establishment_name, table_number } = reservation;
    const isLargeReservation = number_of_people >= 16;

    try {
      const { data, error } = await this.resend.emails.send({
        from: `"${establishment_name}" <reservas@grupoideiaum.com.br>`,
        to: [client_email],
        subject: isLargeReservation ? `🎉 Confirmação de Reserva Grande - ${establishment_name}` : `🍽️ Confirmação de Reserva - ${establishment_name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #333;">Olá, ${client_name}!</h2>
            <p>Sua reserva no <strong>${establishment_name}</strong> foi confirmada com sucesso!</p>
            <hr>
            <h3>Detalhes da Reserva:</h3>
            <ul>
              <li><strong>Data:</strong> ${new Date(reservation_date).toLocaleDateString('pt-BR')}</li>
              <li><strong>Horário:</strong> ${reservation_time}</li>
              <li><strong>Pessoas:</strong> ${number_of_people}</li>
              <li><strong>Área:</strong> ${area_name || 'A definir'}</li>
              ${table_number ? `<li><strong>Mesa:</strong> ${table_number}</li>` : ''}
            </ul>
            <hr>
            <p>Obrigado por escolher o ${establishment_name}!</p>
          </div>
        `
      });

      if (error) {
        console.error('❌ Erro ao enviar email pelo Resend:', error);
        return { success: false, error: error.message };
      }

      console.log('✅ Email de confirmação enviado via Resend! ID:', data.id);
      return { success: true, messageId: data.id };

    } catch (error) {
      console.error('❌ Erro CRÍTICO na função sendReservationConfirmationEmail:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Envia email de notificação para o admin (funciona para reservas normais e grandes)
   */
  async sendAdminReservationNotification(reservation) {
    if (!this.resend) return { success: false, error: 'Serviço de e-mail não configurado.' };

    const { client_name, client_phone, client_email, reservation_date, reservation_time, number_of_people, establishment_name } = reservation;
    const isLargeReservation = number_of_people >= 16;
    const adminEmail = process.env.ADMIN_EMAIL || 'reservas@grupoideiaum.com.br';

    try {
      const { data, error } = await this.resend.emails.send({
        from: `"Sistema de Reservas" <reservas@grupoideiaum.com.br>`,
        to: [adminEmail],
        subject: isLargeReservation ? `🔔 Nova Reserva Grande - ${establishment_name}` : `🔔 Nova Reserva Recebida - ${establishment_name}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>🔔 Nova Reserva Recebida! ${isLargeReservation ? '(GRANDE)' : ''}</h2>
            <p>Uma nova reserva foi criada.</p>
            <h3>Detalhes:</h3>
            <ul>
              <li><strong>Cliente:</strong> ${client_name}</li>
              <li><strong>Telefone:</strong> ${client_phone}</li>
              <li><strong>Email:</strong> ${client_email}</li>
              <li><strong>Data:</strong> ${new Date(reservation_date).toLocaleDateString('pt-BR')}</li>
              <li><strong>Horário:</strong> ${reservation_time}</li>
              <li><strong>Pessoas:</strong> ${number_of_people}</li>
              <li><strong>Estabelecimento:</strong> ${establishment_name}</li>
            </ul>
          </div>
        `
      });

      if (error) {
        console.error('❌ Erro ao enviar e-mail de admin pelo Resend:', error);
        return { success: false, error: error.message };
      }

      console.log('✅ Email de notificação para admin enviado via Resend! ID:', data.id);
      return { success: true, messageId: data.id };

    } catch (error) {
      console.error('❌ Erro CRÍTICO na função sendAdminReservationNotification:', error);
      return { success: false, error: error.message };
    }
  }

  // --- Funções de WhatsApp ---
  
  /**
   * Envia uma mensagem de confirmação de reserva via WhatsApp.
   * Adapta a mensagem se for uma reserva grande (>= 16 pessoas).
   * @param {object} reservation - O objeto da reserva.
   */
  async sendReservationConfirmationWhatsApp(reservation) {
    if (!this.whatsappClient) {
      console.warn('⚠️ AVISO: Cliente do WhatsApp (Twilio) não está configurado.');
      return { success: false, error: 'Serviço de WhatsApp não configurado.' };
    }

    const { client_name, client_phone, reservation_date, reservation_time, number_of_people, establishment_name } = reservation;
    const isLargeReservation = number_of_people >= 16;

    // Formata o número de telefone para o padrão E.164 exigido pela Twilio
    // Exemplo: +5511999998888
    // Adicione uma lógica mais robusta aqui se os números não vierem formatados do front-end
    const formattedPhone = client_phone.startsWith('+') ? client_phone : `+${client_phone}`;

    const to = `whatsapp:${formattedPhone}`;
    const from = `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`;

    let messageBody;

    if (isLargeReservation) {
      messageBody = `Olá, ${client_name}! Sua reserva grande (para ${number_of_people} pessoas) no *${establishment_name}* foi confirmada! 🥳\n\n*Detalhes da Reserva:*\nData: ${new Date(reservation_date).toLocaleDateString('pt-BR')}\nHorário: ${reservation_time}\n\nPara reservas deste tamanho, poderemos entrar em contato para alinhar outros detalhes. Obrigado pela preferência!`;
    } else {
      messageBody = `Olá, ${client_name}! Sua reserva no *${establishment_name}* foi confirmada com sucesso! 🎉\n\n*Detalhes da Reserva:*\nData: ${new Date(reservation_date).toLocaleDateString('pt-BR')}\nHorário: ${reservation_time}\nPessoas: ${number_of_people}\n\nObrigado por escolher o ${establishment_name}!`;
    }

    try {
      const message = await this.whatsappClient.messages.create({
        from: from,
        body: messageBody,
        to: to
      });

      console.log(`✅ Mensagem de confirmação via WhatsApp enviada para ${to}! SID: ${message.sid}`);
      return { success: true, messageSid: message.sid };

    } catch (error) {
      console.error(`❌ Erro CRÍTICO ao enviar WhatsApp para ${to} via Twilio:`, error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = NotificationService;
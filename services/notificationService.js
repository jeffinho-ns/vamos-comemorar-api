const { Resend } = require('resend');
const twilio = require('twilio');

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

    // Configuração do WhatsApp
    this.whatsappClient = null;
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
      this.whatsappClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
       console.log('✅ Serviço de WhatsApp (Twilio) configurado.');
    } else {
        console.warn('⚠️ AVISO: As credenciais da Twilio não foram encontradas. O serviço de WhatsApp está desativado.');
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
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; color: #333; text-align: center;">

          <img src="https://grupoideiaum.com.br/emails/highline/header.png" alt="High Line" style="width: 100%; max-width: 600px; height: auto;">

          <div style="padding: 20px;">
            <h1 style="font-size: 24px; font-weight: bold; color: #000; font-family: 'Courier New', Courier, monospace;">✨ Obrigado pela sua reserva ✨</h1>
            
            <p style="font-size: 16px; line-height: 1.5;">Sua experiência no <strong>${establishment_name}</strong> já está garantida.</p>
            <p style="font-size: 16px; line-height: 1.5;">É um prazer receber você! Estamos ansiosos para proporcionar uma experiência única, repleta de sabor e momentos especiais. Confira abaixo os detalhes da sua reserva:</p>
          </div>

          <div style="text-align: left; padding: 0 30px 20px 30px;">
            <h2 style="font-size: 20px; color: #000; border-bottom: 1px solid #ccc; padding-bottom: 10px; font-weight: bold; text-align: center;">Detalhes da Reserva:</h2>
            <ul style="list-style-type: none; padding: 10px 0 0 0; font-size: 16px;">
              <li style="padding: 8px 0;"><strong>Data:</strong> ${reservation_date ? new Date(reservation_date + 'T12:00:00').toLocaleDateString('pt-BR') : 'Data não informada'}</li>
              <li style="padding: 8px 0;"><strong>Horário:</strong> ${reservation_time}</li>
              <li style="padding: 8px 0;"><strong>Pessoas:</strong> ${number_of_people}</li>
              <li style="padding: 8px 0;"><strong>Área:</strong> ${area_name || 'A definir'}</li>
              ${table_number ? `<li style="padding: 8px 0;"><strong>Mesa:</strong> ${table_number}</li>` : ''}
            </ul>
          </div>

          <div style="background-color: #333; color: #fff; padding: 20px 30px; margin: 20px 0; text-align: left; border-radius: 8px;">
              <h2 style="font-size: 20px; margin-top: 0; text-align: center; font-weight: bold;">Informações importantes</h2>
              <p style="font-size: 14px; line-height: 1.6;">※ Chegue com 10 minutos de antecedência para garantir sua mesa.</p>
              <p style="font-size: 14px; line-height: 1.6;">※ Em caso de atraso superior a 15 minutos, sua reserva poderá ser cancelada.</p>
              <p style="font-size: 14px; line-height: 1.6;">※ Para alterações, entre em contato pelo telefone [telefone do restaurante].</p>
          </div>
          
          <img src="https://grupoideiaum.com.br/emails/highline/banner-regua.jpg" alt="Comemore seu aniversário com a gente!" style="width: 100%; max-width: 600px; height: auto;">

          <div style="padding: 30px 20px;">
            <p style="font-size: 16px;">👉 Aproveite para conhecer nosso cardápio completo e novidades em nosso site.</p>
            
            <a href="#" style="background-color: #000; color: #fff; padding: 15px 30px; text-decoration: none; font-size: 18px; font-weight: bold; display: inline-block; margin-top: 20px; border-radius: 5px;">
                Visitar o Site
            </a>
          </div>

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
              <li><strong>Data:</strong> ${reservation_date ? new Date(reservation_date + 'T12:00:00').toLocaleDateString('pt-BR') : 'Data não informada'}</li>
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

    // --- LÓGICA DE FORMATAÇÃO CORRIGIDA ---
    // 1. Remove todos os caracteres que não são dígitos do número.
    const digitsOnlyPhone = (client_phone || '').replace(/\D/g, '');

    let e164Phone;

    // 2. Se o número tiver 10 ou 11 dígitos (formato brasileiro comum sem o +55), adiciona o código do país.
    if (digitsOnlyPhone.length === 10 || digitsOnlyPhone.length === 11) {
      e164Phone = `+55${digitsOnlyPhone}`;
    } 
    // 3. Se o número já começar com 55 (possivelmente já formatado), apenas adiciona o `+`.
    else if (digitsOnlyPhone.startsWith('55') && (digitsOnlyPhone.length === 12 || digitsOnlyPhone.length === 13)) {
      e164Phone = `+${digitsOnlyPhone}`;
    }
    // 4. Se não se encaixar nas regras acima, usa a lógica original como último recurso.
    else {
      e164Phone = client_phone.startsWith('+') ? client_phone : `+${client_phone}`;
    }
    // --- FIM DA CORREÇÃO ---

    const to = `whatsapp:${e164Phone}`;
    const from = `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`;

    let messageBody;

    if (isLargeReservation) {
      messageBody = `Olá, ${client_name}! Sua reserva grande (para ${number_of_people} pessoas) no *${establishment_name}* foi confirmada! 🥳\n\n*Detalhes da Reserva:*\nData: ${reservation_date ? new Date(reservation_date + 'T12:00:00').toLocaleDateString('pt-BR') : 'Data não informada'}\nHorário: ${reservation_time}\n\nPara reservas deste tamanho, poderemos entrar em contato para alinhar outros detalhes. Obrigado pela preferência!`;
    } else {
      messageBody = `Olá, ${client_name}! Sua reserva no *${establishment_name}* foi confirmada com sucesso! 🎉\n\n*Detalhes da Reserva:*\nData: ${reservation_date ? new Date(reservation_date + 'T12:00:00').toLocaleDateString('pt-BR') : 'Data não informada'}\nHorário: ${reservation_time}\nPessoas: ${number_of_people}\n\nObrigado por escolher o ${establishment_name}!`;
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


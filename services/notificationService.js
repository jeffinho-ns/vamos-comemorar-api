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

    // Configuração do WhatsApp (pode ser ajustada depois)
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
   * Envia email de confirmação de reserva grande
   */
  async sendLargeReservationConfirmationEmail(reservation) {
    try {
      const { client_name, client_email, reservation_date, reservation_time, number_of_people, area_name, establishment_name } = reservation;
      
      const mailOptions = {
        from: `"${establishment_name}" <${process.env.SMTP_USER}>`,
        to: client_email,
        subject: `🎉 Confirmação de Reserva Grande - ${establishment_name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #f97316, #ea580c); padding: 30px; border-radius: 15px; text-align: center; margin-bottom: 30px;">
              <h1 style="color: white; margin: 0; font-size: 28px;">🎉 Reserva Confirmada!</h1>
              <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">${establishment_name}</p>
            </div>
            
            <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; margin-bottom: 20px;">
              <h2 style="color: #333; margin-top: 0;">Olá, ${client_name}!</h2>
              <p style="color: #666; font-size: 16px; line-height: 1.6;">
                Sua reserva grande foi confirmada com sucesso! Estamos ansiosos para receber vocês.
              </p>
            </div>
            
            <div style="background: white; border: 2px solid #f97316; border-radius: 10px; padding: 25px; margin-bottom: 20px;">
              <h3 style="color: #f97316; margin-top: 0; font-size: 20px;">📋 Detalhes da Reserva</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Data:</td>
                  <td style="padding: 8px 0; color: #666;">${new Date(reservation_date).toLocaleDateString('pt-BR')}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Horário:</td>
                  <td style="padding: 8px 0; color: #666;">${reservation_time}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Pessoas:</td>
                  <td style="padding: 8px 0; color: #666;">${number_of_people} pessoas</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Área:</td>
                  <td style="padding: 8px 0; color: #666;">${area_name || 'A definir'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Estabelecimento:</td>
                  <td style="padding: 8px 0; color: #666;">${establishment_name}</td>
                </tr>
              </table>
            </div>
            
            <div style="background: #e7f3ff; border-left: 4px solid #3b82f6; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
              <h4 style="color: #1e40af; margin-top: 0;">ℹ️ Informações Importantes</h4>
              <ul style="color: #1e40af; padding-left: 20px;">
                <li>Sua reserva está sujeita à disponibilidade de mesas</li>
                <li>Chegue com 15 minutos de antecedência</li>
                <li>Para cancelamentos, entre em contato com pelo menos 2 horas de antecedência</li>
                <li>Em caso de dúvidas, entre em contato conosco</li>
              </ul>
            </div>
            
            <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 10px;">
              <p style="color: #666; margin: 0; font-size: 14px;">
                Obrigado por escolher o ${establishment_name}!<br>
                Esperamos proporcionar uma experiência inesquecível para vocês.
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                Este é um email automático. Por favor, não responda a esta mensagem.
              </p>
            </div>
          </div>
        `
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email enviado com sucesso:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Erro ao enviar email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Envia mensagem de confirmação via WhatsApp
   */
  async sendLargeReservationConfirmationWhatsApp(reservation) {
    try {
      if (!this.whatsappClient) {
        console.log('⚠️ WhatsApp client não configurado');
        return { success: false, error: 'WhatsApp não configurado' };
      }

      const { client_phone, client_name, reservation_date, reservation_time, number_of_people, establishment_name } = reservation;
      
      const formattedPhone = client_phone.replace(/\D/g, '');
      const phoneNumber = formattedPhone.startsWith('55') ? formattedPhone : `55${formattedPhone}`;
      
      const message = `
🎉 *Reserva Grande Confirmada - ${establishment_name}*

Olá ${client_name}! 

Sua reserva grande foi confirmada com sucesso! 

📋 *Detalhes:*
• Data: ${new Date(reservation_date).toLocaleDateString('pt-BR')}
• Horário: ${reservation_time}
• Pessoas: ${number_of_people}

ℹ️ *Importante:*
• Chegue com 15 min de antecedência
• Para cancelamentos: 2h de antecedência
• Sujeito à disponibilidade

Obrigado por escolher o ${establishment_name}! 
Esperamos proporcionar uma experiência inesquecível! 🍽️✨
      `.trim();

      const result = await this.whatsappClient.messages.create({
        body: message,
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:+${phoneNumber}`
      });

      console.log('✅ WhatsApp enviado com sucesso:', result.sid);
      return { success: true, messageId: result.sid };
    } catch (error) {
      console.error('❌ Erro ao enviar WhatsApp:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Envia email de confirmação de reserva normal
   */
  async sendReservationConfirmationEmail(reservation) {
    try {
      const { client_name, client_email, reservation_date, reservation_time, number_of_people, area_name, establishment_name, table_number } = reservation;
      
      const mailOptions = {
        from: `"${establishment_name}" <${process.env.SMTP_USER}>`,
        to: client_email,
        subject: `🍽️ Confirmação de Reserva - ${establishment_name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #f97316, #ea580c); padding: 30px; border-radius: 15px; text-align: center; margin-bottom: 30px;">
              <h1 style="color: white; margin: 0; font-size: 28px;">🍽️ Reserva Confirmada!</h1>
              <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">${establishment_name}</p>
            </div>
            
            <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; margin-bottom: 20px;">
              <h2 style="color: #333; margin-top: 0;">Olá, ${client_name}!</h2>
              <p style="color: #666; font-size: 16px; line-height: 1.6;">
                Sua reserva foi confirmada com sucesso! Estamos ansiosos para recebê-lo.
              </p>
            </div>
            
            <div style="background: white; border: 2px solid #f97316; border-radius: 10px; padding: 25px; margin-bottom: 20px;">
              <h3 style="color: #f97316; margin-top: 0; font-size: 20px;">📋 Detalhes da Reserva</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Data:</td>
                  <td style="padding: 8px 0; color: #666;">${new Date(reservation_date).toLocaleDateString('pt-BR')}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Horário:</td>
                  <td style="padding: 8px 0; color: #666;">${reservation_time}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Pessoas:</td>
                  <td style="padding: 8px 0; color: #666;">${number_of_people} pessoa${number_of_people > 1 ? 's' : ''}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Área:</td>
                  <td style="padding: 8px 0; color: #666;">${area_name || 'A definir'}</td>
                </tr>
                ${table_number ? `
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Mesa:</td>
                  <td style="padding: 8px 0; color: #666;">Mesa ${table_number}</td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Estabelecimento:</td>
                  <td style="padding: 8px 0; color: #666;">${establishment_name}</td>
                </tr>
              </table>
            </div>
            
            <div style="background: #e7f3ff; border-left: 4px solid #3b82f6; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
              <h4 style="color: #1e40af; margin-top: 0;">ℹ️ Informações Importantes</h4>
              <ul style="color: #1e40af; padding-left: 20px;">
                <li>Chegue com 15 minutos de antecedência</li>
                <li>Para cancelamentos, entre em contato com pelo menos 2 horas de antecedência</li>
                <li>Em caso de dúvidas, entre em contato conosco</li>
              </ul>
            </div>
            
            <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 10px;">
              <p style="color: #666; margin: 0; font-size: 14px;">
                Obrigado por escolher o ${establishment_name}!<br>
                Esperamos proporcionar uma experiência inesquecível.
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                Este é um email automático. Por favor, não responda a esta mensagem.
              </p>
            </div>
          </div>
        `
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email de confirmação enviado:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Erro ao enviar email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Envia mensagem de confirmação via WhatsApp para reserva normal
   */
  async sendReservationConfirmationWhatsApp(reservation) {
    try {
      if (!this.whatsappClient) {
        console.log('⚠️ WhatsApp client não configurado');
        return { success: false, error: 'WhatsApp não configurado' };
      }

      const { client_phone, client_name, reservation_date, reservation_time, number_of_people, establishment_name, table_number } = reservation;
      
      const formattedPhone = client_phone.replace(/\D/g, '');
      const phoneNumber = formattedPhone.startsWith('55') ? formattedPhone : `55${formattedPhone}`;
      
      const message = `
🍽️ *Reserva Confirmada - ${establishment_name}*

Olá ${client_name}! 

Sua reserva foi confirmada com sucesso! 

📋 *Detalhes:*
• Data: ${new Date(reservation_date).toLocaleDateString('pt-BR')}
• Horário: ${reservation_time}
• Pessoas: ${number_of_people}
${table_number ? `• Mesa: ${table_number}` : ''}

ℹ️ *Importante:*
• Chegue com 15 min de antecedência
• Para cancelamentos: 2h de antecedência

Obrigado por escolher o ${establishment_name}! 
Esperamos proporcionar uma experiência inesquecível! 🍽️✨
      `.trim();

      const result = await this.whatsappClient.messages.create({
        body: message,
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:+${phoneNumber}`
      });

      console.log('✅ WhatsApp enviado com sucesso:', result.sid);
      return { success: true, messageId: result.sid };
    } catch (error) {
      console.error('❌ Erro ao enviar WhatsApp:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Envia notificações para o admin sobre nova reserva normal
   */
  async sendAdminReservationNotification(reservation) {
    try {
      const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
      
      const mailOptions = {
        from: `"${reservation.establishment_name}" <${process.env.SMTP_USER}>`,
        to: adminEmail,
        subject: `🔔 Nova Reserva - ${reservation.establishment_name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); padding: 30px; border-radius: 15px; text-align: center; margin-bottom: 30px;">
              <h1 style="color: white; margin: 0; font-size: 28px;">🔔 Nova Reserva</h1>
              <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">${reservation.establishment_name}</p>
            </div>
            
            <div style="background: white; border: 2px solid #3b82f6; border-radius: 10px; padding: 25px;">
              <h3 style="color: #3b82f6; margin-top: 0; font-size: 20px;">📋 Detalhes da Reserva</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Cliente:</td>
                  <td style="padding: 8px 0; color: #666;">${reservation.client_name}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Telefone:</td>
                  <td style="padding: 8px 0; color: #666;">${reservation.client_phone}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Email:</td>
                  <td style="padding: 8px 0; color: #666;">${reservation.client_email}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Data:</td>
                  <td style="padding: 8px 0; color: #666;">${new Date(reservation.reservation_date).toLocaleDateString('pt-BR')}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Horário:</td>
                  <td style="padding: 8px 0; color: #666;">${reservation.reservation_time}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Pessoas:</td>
                  <td style="padding: 8px 0; color: #666;">${reservation.number_of_people} pessoa${reservation.number_of_people > 1 ? 's' : ''}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Área:</td>
                  <td style="padding: 8px 0; color: #666;">${reservation.area_name || 'A definir'}</td>
                </tr>
                ${reservation.table_number ? `
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Mesa:</td>
                  <td style="padding: 8px 0; color: #666;">Mesa ${reservation.table_number}</td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Origem:</td>
                  <td style="padding: 8px 0; color: #666;">${reservation.origin}</td>
                </tr>
                ${reservation.notes ? `
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Observações:</td>
                  <td style="padding: 8px 0; color: #666;">${reservation.notes}</td>
                </tr>
                ` : ''}
              </table>
            </div>
            
            <div style="text-align: center; margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 10px;">
              <p style="color: #666; margin: 0; font-size: 14px;">
                Acesse o painel administrativo para gerenciar esta reserva.
              </p>
            </div>
          </div>
        `
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('✅ Notificação admin enviada com sucesso:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Erro ao enviar notificação admin:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Envia notificações para o admin sobre nova reserva grande
   */
  async sendAdminNotification(reservation) {
    try {
      const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
      
      const mailOptions = {
        from: `"${reservation.establishment_name}" <${process.env.SMTP_USER}>`,
        to: adminEmail,
        subject: `🔔 Nova Reserva Grande - ${reservation.establishment_name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #dc2626, #b91c1c); padding: 30px; border-radius: 15px; text-align: center; margin-bottom: 30px;">
              <h1 style="color: white; margin: 0; font-size: 28px;">🔔 Nova Reserva Grande</h1>
              <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">${reservation.establishment_name}</p>
            </div>
            
            <div style="background: white; border: 2px solid #dc2626; border-radius: 10px; padding: 25px;">
              <h3 style="color: #dc2626; margin-top: 0; font-size: 20px;">📋 Detalhes da Reserva</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Cliente:</td>
                  <td style="padding: 8px 0; color: #666;">${reservation.client_name}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Telefone:</td>
                  <td style="padding: 8px 0; color: #666;">${reservation.client_phone}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Email:</td>
                  <td style="padding: 8px 0; color: #666;">${reservation.client_email}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Data:</td>
                  <td style="padding: 8px 0; color: #666;">${new Date(reservation.reservation_date).toLocaleDateString('pt-BR')}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Horário:</td>
                  <td style="padding: 8px 0; color: #666;">${reservation.reservation_time}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Pessoas:</td>
                  <td style="padding: 8px 0; color: #666;">${reservation.number_of_people} pessoas</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Área:</td>
                  <td style="padding: 8px 0; color: #666;">${reservation.area_name || 'A definir'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Origem:</td>
                  <td style="padding: 8px 0; color: #666;">${reservation.origin}</td>
                </tr>
                ${reservation.notes ? `
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #333;">Observações:</td>
                  <td style="padding: 8px 0; color: #666;">${reservation.notes}</td>
                </tr>
                ` : ''}
              </table>
            </div>
            
            <div style="text-align: center; margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 10px;">
              <p style="color: #666; margin: 0; font-size: 14px;">
                Acesse o painel administrativo para gerenciar esta reserva.
              </p>
            </div>
          </div>
        `
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('✅ Notificação admin enviada com sucesso:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Erro ao enviar notificação admin:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = NotificationService;
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
   * Formata data no formato brasileiro (DD/MM/YYYY)
   * @param {string} dateString - Data no formato YYYY-MM-DD
   * @returns {string} Data formatada em DD/MM/YYYY
   */
  formatDateBR(dateString) {
    if (!dateString) return 'Data não informada';
    
    try {
      // Se a data vier no formato YYYY-MM-DD
      const [year, month, day] = dateString.split('T')[0].split('-');
      return `${day}/${month}/${year}`;
    } catch (error) {
      console.error('Erro ao formatar data:', error);
      return dateString;
    }
  }

  /**
   * Formata horário removendo os segundos se necessário
   * @param {string} timeString - Horário no formato HH:MM:SS ou HH:MM
   * @returns {string} Horário formatado em HH:MM
   */
  formatTime(timeString) {
    if (!timeString) return 'Horário não informado';
    
    // Remove os segundos se existirem (20:00:00 -> 20:00)
    const parts = timeString.split(':');
    return `${parts[0]}:${parts[1]}`;
  }

  /**
   * Obtém a URL da imagem do header do e-mail baseado no estabelecimento
   * @param {string} establishmentName - Nome do estabelecimento
   * @returns {string} URL da imagem do header
   */
  getEmailHeaderImage(establishmentName) {
    if (!establishmentName) {
      // Fallback para Highline se não houver nome
      return 'https://grupoideiaum.com.br/emails/highline/header.png';
    }
    
    const nameLower = establishmentName.toLowerCase();
    
    // Verificar Pracinha primeiro (para não confundir com Seu Justino)
    if (nameLower.includes('pracinha')) {
      return 'https://grupoideiaum.com.br/emails/pracinha/header-pracinha.png';
    }
    
    // Verificar Seu Justino (mas não Pracinha)
    if (nameLower.includes('seu justino') && !nameLower.includes('pracinha')) {
      return 'https://grupoideiaum.com.br/emails/justino/header-justino.png';
    }
    
    // Verificar Highline
    if (nameLower.includes('high')) {
      return 'https://grupoideiaum.com.br/emails/highline/header.png';
    }
    
    // Fallback para Highline
    return 'https://grupoideiaum.com.br/emails/highline/header.png';
  }

  /**
   * Obtém o nome correto da subárea do High Line baseado no número da mesa
   * @param {string|number} tableNumber - Número da mesa
   * @param {string} defaultAreaName - Nome da área padrão do banco
   * @returns {string} Nome específico da subárea
   */
  getHighlineSubareaName(tableNumber, defaultAreaName) {
    if (!tableNumber) return defaultAreaName;
    
    const n = String(tableNumber);
    
    // Mapeamento das mesas para subáreas específicas
    const subareaMap = {
      '05': 'Área Deck - Frente',
      '06': 'Área Deck - Frente',
      '07': 'Área Deck - Frente',
      '08': 'Área Deck - Frente',
      
      '01': 'Área Deck - Esquerdo',
      '02': 'Área Deck - Esquerdo',
      '03': 'Área Deck - Esquerdo',
      '04': 'Área Deck - Esquerdo',
      
      '09': 'Área Deck - Direito',
      '10': 'Área Deck - Direito',
      '11': 'Área Deck - Direito',
      '12': 'Área Deck - Direito',
      
      '15': 'Área Bar',
      '16': 'Área Bar',
      '17': 'Área Bar',
      
      '50': 'Área Rooftop - Direito',
      '51': 'Área Rooftop - Direito',
      '52': 'Área Rooftop - Direito',
      '53': 'Área Rooftop - Direito',
      '54': 'Área Rooftop - Direito',
      '55': 'Área Rooftop - Direito',
      
      '70': 'Área Rooftop - Bistrô',
      '71': 'Área Rooftop - Bistrô',
      '72': 'Área Rooftop - Bistrô',
      '73': 'Área Rooftop - Bistrô',
      
      '44': 'Área Rooftop - Centro',
      '45': 'Área Rooftop - Centro',
      '46': 'Área Rooftop - Centro',
      '47': 'Área Rooftop - Centro',
      
      '60': 'Área Rooftop - Esquerdo',
      '61': 'Área Rooftop - Esquerdo',
      '62': 'Área Rooftop - Esquerdo',
      '63': 'Área Rooftop - Esquerdo',
      '64': 'Área Rooftop - Esquerdo',
      '65': 'Área Rooftop - Esquerdo',
      
      '40': 'Área Rooftop - Vista',
      '41': 'Área Rooftop - Vista',
      '42': 'Área Rooftop - Vista'
    };
    
    return subareaMap[n] || defaultAreaName;
  }

  /**
   * Envia email de confirmação para o cliente (funciona para reservas normais e grandes)
   */
  async sendReservationConfirmationEmail(reservation) {
    if (!this.resend) return { success: false, error: 'Serviço de e-mail não configurado.' };
    
    const { client_name, client_email, reservation_date, reservation_time, number_of_people, area_name, establishment_name, table_number } = reservation;
    const isLargeReservation = number_of_people >= 16;
    
    // Formata data e horário
    const formattedDate = this.formatDateBR(reservation_date);
    const formattedTime = this.formatTime(reservation_time);
    
    // Verifica se é High Line e obtém o nome correto da subárea baseado na mesa
    const isHighLine = establishment_name && establishment_name.toLowerCase().includes('high');
    const displayAreaName = isHighLine ? this.getHighlineSubareaName(table_number, area_name) : area_name;
    
    // Obtém a URL da imagem do header baseado no estabelecimento
    const headerImageUrl = this.getEmailHeaderImage(establishment_name);

    try {
      const { data, error } = await this.resend.emails.send({
        from: `"${establishment_name}" <reservas@grupoideiaum.com.br>`,
        to: [client_email],
        subject: isLargeReservation ? `🎉 Confirmação de Reserva Grande - ${establishment_name}` : `🍽️ Confirmação de Reserva - ${establishment_name}`,
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; color: #333; text-align: center;">

          <img src="${headerImageUrl}" alt="${establishment_name}" style="width: 100%; max-width: 600px; height: auto;">

          <div style="padding: 20px;">
            <h1 style="font-size: 24px; font-weight: bold; color: #000; font-family: 'Courier New', Courier, monospace;">✨ Obrigado pela sua reserva${client_name ? ', ' + client_name : ''}! ✨</h1>
            
            <p style="font-size: 16px; line-height: 1.5;">Sua experiência no <strong>${establishment_name}</strong> já está garantida.</p>
            <p style="font-size: 16px; line-height: 1.5;">É um prazer receber você! Estamos ansiosos para proporcionar uma experiência única, repleta de sabor e momentos especiais.</p>
          </div>

          <!-- Detalhes da Reserva com Destaque -->
          <div style="background: linear-gradient(135deg, #FF6B35 0%, #F7931E 100%); padding: 30px; margin: 20px 0; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
            <h2 style="font-size: 22px; color: #fff; margin: 0 0 20px 0; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">📋 Detalhes da Sua Reserva</h2>
            
            <div style="background-color: rgba(255,255,255,0.95); border-radius: 8px; padding: 25px; text-align: left;">
              
              <!-- Data -->
              <div style="margin-bottom: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #FF6B35; border-radius: 4px;">
                <div style="font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;">📅 Data</div>
                <div style="font-size: 24px; font-weight: bold; color: #000;">${formattedDate}</div>
              </div>
              
              <!-- Horário -->
              <div style="margin-bottom: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #FF6B35; border-radius: 4px;">
                <div style="font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;">🕐 Horário</div>
                <div style="font-size: 24px; font-weight: bold; color: #000;">${formattedTime}</div>
              </div>
              
              <!-- Número de Pessoas -->
              <div style="margin-bottom: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #FF6B35; border-radius: 4px;">
                <div style="font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;">👥 Número de Pessoas</div>
                <div style="font-size: 24px; font-weight: bold; color: #000;">${number_of_people} ${number_of_people === 1 ? 'pessoa' : 'pessoas'}</div>
              </div>
              
              <!-- Área -->
              <div style="margin-bottom: ${table_number ? '20px' : '0'}; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #FF6B35; border-radius: 4px;">
                <div style="font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;">📍 Área</div>
                <div style="font-size: 20px; font-weight: bold; color: #000;">${displayAreaName || 'A definir'}</div>
              </div>
              
              ${table_number ? `
              <!-- Mesa -->
              <div style="padding: 15px; background-color: #f8f9fa; border-left: 4px solid #FF6B35; border-radius: 4px;">
                <div style="font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;">🪑 Mesa</div>
                <div style="font-size: 20px; font-weight: bold; color: #000;">Mesa ${table_number}</div>
              </div>
              ` : ''}
            </div>
          </div>

          <div style="background-color: #333; color: #fff; padding: 20px 30px; margin: 20px 0; text-align: left; border-radius: 8px;">
              <h2 style="font-size: 20px; margin-top: 0; text-align: center; font-weight: bold;">⚠️ Informações Importantes</h2>
              <p style="font-size: 14px; line-height: 1.6; margin: 10px 0;">✓ Chegue com <strong>10 minutos de antecedência</strong> para garantir sua mesa.</p>
              <p style="font-size: 14px; line-height: 1.6; margin: 10px 0;">✓ Em caso de atraso superior a <strong>15 minutos</strong>, sua reserva poderá ser cancelada.</p>
              <p style="font-size: 14px; line-height: 1.6; margin: 10px 0;">✓ Para alterações ou cancelamentos, entre em contato conosco.</p>
          </div>
          
          <img src="https://grupoideiaum.com.br/emails/highline/banner-regua.jpg" alt="Comemore seu aniversário com a gente!" style="width: 100%; max-width: 600px; height: auto; margin: 20px 0;">

          <div style="padding: 30px 20px;">
            <p style="font-size: 16px; color: #666;">Estamos aguardando você! 🎉</p>
            
            <a href="https://agilizaiapp.com.br" style="background-color: #000; color: #fff; padding: 15px 30px; text-decoration: none; font-size: 18px; font-weight: bold; display: inline-block; margin-top: 20px; border-radius: 5px;">
                Visitar o Site
            </a>
          </div>

          <div style="padding: 20px; background-color: #f8f9fa; margin-top: 30px; border-top: 3px solid #FF6B35;">
            <p style="font-size: 12px; color: #666; margin: 5px 0;">© ${new Date().getFullYear()} ${establishment_name}</p>
            <p style="font-size: 12px; color: #666; margin: 5px 0;">Grupo Ideia Um</p>
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

    const { client_name, client_phone, client_email, reservation_date, reservation_time, number_of_people, establishment_name, area_name, table_number } = reservation;
    const isLargeReservation = number_of_people >= 16;
    const adminEmail = process.env.ADMIN_EMAIL || 'reservas@grupoideiaum.com.br';
    
    // Formata data e horário
    const formattedDate = this.formatDateBR(reservation_date);
    const formattedTime = this.formatTime(reservation_time);
    
    // Verifica se é High Line e obtém o nome correto da subárea baseado na mesa
    const isHighLine = establishment_name && establishment_name.toLowerCase().includes('high');
    const displayAreaName = isHighLine ? this.getHighlineSubareaName(table_number, area_name) : area_name;

    try {
      const { data, error } = await this.resend.emails.send({
        from: `"Sistema de Reservas" <reservas@grupoideiaum.com.br>`,
        to: [adminEmail],
        subject: isLargeReservation ? `🔔 Nova Reserva Grande - ${establishment_name}` : `🔔 Nova Reserva Recebida - ${establishment_name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f5f5f5; padding: 20px;">
            <div style="background-color: #fff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <h2 style="color: #FF6B35; margin-top: 0;">🔔 Nova Reserva Recebida! ${isLargeReservation ? '<span style="background-color: #ffd700; color: #000; padding: 5px 10px; border-radius: 4px; font-size: 14px;">GRANDE</span>' : ''}</h2>
              <p style="font-size: 16px; color: #666;">Uma nova reserva foi criada no sistema.</p>
              
              <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #333; margin-top: 0;">📋 Detalhes da Reserva:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0;"><strong>Cliente:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0; text-align: right;">${client_name}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0;"><strong>Telefone:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0; text-align: right;"><a href="tel:${client_phone}">${client_phone}</a></td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0;"><strong>Email:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0; text-align: right;"><a href="mailto:${client_email}">${client_email}</a></td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0;"><strong>📅 Data:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0; text-align: right; font-size: 18px; color: #FF6B35; font-weight: bold;">${formattedDate}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0;"><strong>🕐 Horário:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0; text-align: right; font-size: 18px; color: #FF6B35; font-weight: bold;">${formattedTime}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0;"><strong>👥 Pessoas:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0; text-align: right; font-size: 18px; color: #FF6B35; font-weight: bold;">${number_of_people}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0;"><strong>📍 Área:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0; text-align: right;">${displayAreaName || 'A definir'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0;"><strong>🏢 Estabelecimento:</strong></td>
                    <td style="padding: 10px 0; text-align: right;">${establishment_name}</td>
                  </tr>
                </table>
              </div>
              
              <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0; color: #856404;"><strong>⚠️ Ação Necessária:</strong> Confirme ou ajuste esta reserva no painel administrativo.</p>
              </div>
              
              <div style="text-align: center; margin-top: 30px;">
                <a href="https://agilizaiapp.com.br/admin/restaurant-reservations" style="background-color: #FF6B35; color: #fff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                  Ver no Sistema
                </a>
              </div>
            </div>
            
            <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
              <p>Sistema de Reservas - Grupo Ideia Um</p>
            </div>
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
    
    // Formata data e horário
    const formattedDate = this.formatDateBR(reservation_date);
    const formattedTime = this.formatTime(reservation_time);

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
      messageBody = `Olá, ${client_name}! Sua reserva grande (para ${number_of_people} pessoas) no *${establishment_name}* foi confirmada! 🥳\n\n*Detalhes da Reserva:*\n📅 Data: ${formattedDate}\n🕐 Horário: ${formattedTime}\n👥 Pessoas: ${number_of_people}\n\nPara reservas deste tamanho, poderemos entrar em contato para alinhar outros detalhes. Obrigado pela preferência!`;
    } else {
      messageBody = `Olá, ${client_name}! Sua reserva no *${establishment_name}* foi confirmada com sucesso! 🎉\n\n*Detalhes da Reserva:*\n📅 Data: ${formattedDate}\n🕐 Horário: ${formattedTime}\n👥 Pessoas: ${number_of_people}\n\nObrigado por escolher o ${establishment_name}!`;
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

  /**
   * Envia email de confirmação para reservas grandes (11+ pessoas)
   */
  async sendLargeReservationConfirmationEmail(reservation) {
    // Reutiliza a mesma função de confirmação que já adapta o conteúdo baseado no número de pessoas
    return this.sendReservationConfirmationEmail(reservation);
  }

  /**
   * Envia WhatsApp de confirmação para reservas grandes (11+ pessoas)
   */
  async sendLargeReservationConfirmationWhatsApp(reservation) {
    // Reutiliza a mesma função de confirmação que já adapta o conteúdo baseado no número de pessoas
    return this.sendReservationConfirmationWhatsApp(reservation);
  }

  /**
   * Envia notificação para admin sobre nova reserva (alias para sendAdminReservationNotification)
   */
  async sendAdminNotification(reservation) {
    return this.sendAdminReservationNotification(reservation);
  }

  /**
   * Envia email quando a reserva é confirmada pelo admin
   */
  async sendReservationConfirmedEmail(reservation) {
    if (!this.resend) return { success: false, error: 'Serviço de e-mail não configurado.' };
    
    const { client_name, client_email, reservation_date, reservation_time, number_of_people, area_name, establishment_name, table_number } = reservation;
    
    // Formata data e horário
    const formattedDate = this.formatDateBR(reservation_date);
    const formattedTime = this.formatTime(reservation_time);
    
    // Verifica se é High Line e obtém o nome correto da subárea baseado na mesa
    const isHighLine = establishment_name && establishment_name.toLowerCase().includes('high');
    const displayAreaName = isHighLine ? this.getHighlineSubareaName(table_number, area_name) : area_name;
    
    // Obtém a URL da imagem do header baseado no estabelecimento
    const headerImageUrl = this.getEmailHeaderImage(establishment_name);

    try {
      const { data, error } = await this.resend.emails.send({
        from: `"${establishment_name}" <reservas@grupoideiaum.com.br>`,
        to: [client_email],
        subject: `✅ Reserva Confirmada - ${establishment_name}`,
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; color: #333; text-align: center;">

          <img src="${headerImageUrl}" alt="${establishment_name}" style="width: 100%; max-width: 600px; height: auto;">

          <div style="padding: 20px;">
            <h1 style="font-size: 24px; font-weight: bold; color: #000; font-family: 'Courier New', Courier, monospace;">✅ Sua Reserva Foi Confirmada! ✅</h1>
            
            <p style="font-size: 16px; line-height: 1.5;">Olá <strong>${client_name}</strong>,</p>
            <p style="font-size: 16px; line-height: 1.5;">Temos o prazer de informar que sua reserva no <strong>${establishment_name}</strong> foi <strong>confirmada pelo nosso time</strong>!</p>
            <p style="font-size: 16px; line-height: 1.5;">Estamos ansiosos para receber você. Confira os detalhes confirmados:</p>
          </div>

          <!-- Status Confirmada -->
          <div style="background-color: #28a745; color: #fff; padding: 20px 30px; margin: 20px; text-align: center; border-radius: 12px; box-shadow: 0 4px 15px rgba(40, 167, 69, 0.3);">
              <h2 style="font-size: 24px; margin: 0; font-weight: bold;">✅ STATUS: CONFIRMADA ✅</h2>
              <p style="font-size: 14px; line-height: 1.6; margin: 10px 0 0 0;">Sua mesa está garantida! Nos vemos em breve.</p>
          </div>

          <!-- Detalhes da Reserva com Destaque -->
          <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); padding: 30px; margin: 20px 0; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
            <h2 style="font-size: 22px; color: #fff; margin: 0 0 20px 0; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">📋 Detalhes da Sua Reserva</h2>
            
            <div style="background-color: rgba(255,255,255,0.95); border-radius: 8px; padding: 25px; text-align: left;">
              
              <!-- Data -->
              <div style="margin-bottom: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #28a745; border-radius: 4px;">
                <div style="font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;">📅 Data</div>
                <div style="font-size: 24px; font-weight: bold; color: #000;">${formattedDate}</div>
              </div>
              
              <!-- Horário -->
              <div style="margin-bottom: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #28a745; border-radius: 4px;">
                <div style="font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;">🕐 Horário</div>
                <div style="font-size: 24px; font-weight: bold; color: #000;">${formattedTime}</div>
              </div>
              
              <!-- Número de Pessoas -->
              <div style="margin-bottom: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #28a745; border-radius: 4px;">
                <div style="font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;">👥 Número de Pessoas</div>
                <div style="font-size: 24px; font-weight: bold; color: #000;">${number_of_people} ${number_of_people === 1 ? 'pessoa' : 'pessoas'}</div>
              </div>
              
              <!-- Área -->
              <div style="margin-bottom: ${table_number ? '20px' : '0'}; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #28a745; border-radius: 4px;">
                <div style="font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;">📍 Área</div>
                <div style="font-size: 20px; font-weight: bold; color: #000;">${displayAreaName || 'A definir'}</div>
              </div>
              
              ${table_number ? `
              <!-- Mesa -->
              <div style="padding: 15px; background-color: #f8f9fa; border-left: 4px solid #28a745; border-radius: 4px;">
                <div style="font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;">🪑 Mesa</div>
                <div style="font-size: 20px; font-weight: bold; color: #000;">Mesa ${table_number}</div>
              </div>
              ` : ''}
            </div>
          </div>

          <div style="background-color: #333; color: #fff; padding: 20px 30px; margin: 20px 0; text-align: left; border-radius: 8px;">
              <h2 style="font-size: 20px; margin-top: 0; text-align: center; font-weight: bold;">⚠️ Informações Importantes</h2>
              <p style="font-size: 14px; line-height: 1.6; margin: 10px 0;">✓ Chegue com <strong>10 minutos de antecedência</strong> para garantir sua mesa.</p>
              <p style="font-size: 14px; line-height: 1.6; margin: 10px 0;">✓ Em caso de atraso superior a <strong>15 minutos</strong>, sua reserva poderá ser cancelada.</p>
              <p style="font-size: 14px; line-height: 1.6; margin: 10px 0;">✓ Para alterações ou cancelamentos, entre em contato conosco.</p>
          </div>
          
          <img src="https://grupoideiaum.com.br/emails/highline/banner-regua.jpg" alt="Comemore seu aniversário com a gente!" style="width: 100%; max-width: 600px; height: auto; margin: 20px 0;">

          <div style="padding: 30px 20px;">
            <p style="font-size: 16px; color: #666;">Estamos aguardando você! 🎉</p>
            
            <a href="https://agilizaiapp.com.br" style="background-color: #000; color: #fff; padding: 15px 30px; text-decoration: none; font-size: 18px; font-weight: bold; display: inline-block; margin-top: 20px; border-radius: 5px;">
                Visitar o Site
            </a>
          </div>

          <div style="padding: 20px; background-color: #f8f9fa; margin-top: 30px; border-top: 3px solid #28a745;">
            <p style="font-size: 12px; color: #666; margin: 5px 0;">© ${new Date().getFullYear()} ${establishment_name}</p>
            <p style="font-size: 12px; color: #666; margin: 5px 0;">Grupo Ideia Um</p>
          </div>

        </div>
        `
      });

      if (error) {
        console.error('❌ Erro ao enviar email de confirmação pelo Resend:', error);
        return { success: false, error: error.message };
      }

      console.log('✅ Email de confirmação da reserva enviado via Resend! ID:', data.id);
      return { success: true, messageId: data.id };

    } catch (error) {
      console.error('❌ Erro CRÍTICO na função sendReservationConfirmedEmail:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Envia WhatsApp quando a reserva é confirmada pelo admin
   */
  async sendReservationConfirmedWhatsApp(reservation) {
    if (!this.whatsappClient) {
      console.warn('⚠️ AVISO: Cliente do WhatsApp (Twilio) não está configurado.');
      return { success: false, error: 'Serviço de WhatsApp não configurado.' };
    }

    const { client_name, client_phone, reservation_date, reservation_time, number_of_people, establishment_name } = reservation;
    
    // Formata data e horário
    const formattedDate = this.formatDateBR(reservation_date);
    const formattedTime = this.formatTime(reservation_time);

    // Formatação do telefone
    const digitsOnlyPhone = (client_phone || '').replace(/\D/g, '');
    let e164Phone;

    if (digitsOnlyPhone.length === 10 || digitsOnlyPhone.length === 11) {
      e164Phone = `+55${digitsOnlyPhone}`;
    } 
    else if (digitsOnlyPhone.startsWith('55') && (digitsOnlyPhone.length === 12 || digitsOnlyPhone.length === 13)) {
      e164Phone = `+${digitsOnlyPhone}`;
    }
    else {
      e164Phone = client_phone.startsWith('+') ? client_phone : `+${client_phone}`;
    }

    const to = `whatsapp:${e164Phone}`;
    const from = `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`;

    const messageBody = `✅ *RESERVA CONFIRMADA!*\n\nOlá, ${client_name}!\n\nSua reserva no *${establishment_name}* foi confirmada pelo nosso time! 🎉\n\n*Detalhes:*\n📅 Data: ${formattedDate}\n🕐 Horário: ${formattedTime}\n👥 Pessoas: ${number_of_people}\n\nNos vemos em breve! 🍽️`;

    try {
      const message = await this.whatsappClient.messages.create({
        from: from,
        body: messageBody,
        to: to
      });

      console.log(`✅ WhatsApp de confirmação enviado para ${to}! SID: ${message.sid}`);
      return { success: true, messageSid: message.sid };

    } catch (error) {
      console.error(`❌ Erro ao enviar WhatsApp de confirmação para ${to}:`, error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = NotificationService;


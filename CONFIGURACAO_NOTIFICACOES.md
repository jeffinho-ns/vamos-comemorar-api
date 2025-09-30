# 📧 Configuração de Notificações

Para que o sistema de notificações (email e WhatsApp) funcione, você precisa configurar as seguintes variáveis de ambiente no arquivo `.env`:

## 📧 Configuração de Email (SMTP)

```env
# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu-email@gmail.com
SMTP_PASS=sua-senha-de-app
ADMIN_EMAIL=admin@suaempresa.com
```

### Para Gmail:
1. Ative a verificação em 2 etapas
2. Gere uma "Senha de App" específica
3. Use essa senha no campo `SMTP_PASS`

## 📱 Configuração de WhatsApp (Twilio)

```env
# WhatsApp Configuration
TWILIO_ACCOUNT_SID=seu_account_sid
TWILIO_AUTH_TOKEN=seu_auth_token
TWILIO_WHATSAPP_NUMBER=+14155238886
```

### Para Twilio:
1. Crie uma conta no [Twilio](https://www.twilio.com)
2. Ative o WhatsApp Sandbox
3. Use o número fornecido pelo Twilio

## 🧪 Teste das Notificações

Para testar se as notificações estão funcionando:

1. **Teste de Email:**
   ```bash
   node -e "
   const NotificationService = require('./services/notificationService');
   const service = new NotificationService();
   service.sendReservationConfirmationEmail({
     client_name: 'Teste',
     client_email: 'teste@email.com',
     reservation_date: '2024-01-01',
     reservation_time: '19:00',
     number_of_people: 2,
     area_name: 'Área Teste',
     establishment_name: 'Highline',
     table_number: '1'
   }).then(result => console.log('Resultado:', result));
   "
   ```

2. **Teste de WhatsApp:**
   ```bash
   node -e "
   const NotificationService = require('./services/notificationService');
   const service = new NotificationService();
   service.sendReservationConfirmationWhatsApp({
     client_phone: '11999999999',
     client_name: 'Teste',
     reservation_date: '2024-01-01',
     reservation_time: '19:00',
     number_of_people: 2,
     establishment_name: 'Highline',
     table_number: '1'
   }).then(result => console.log('Resultado:', result));
   "
   ```

## 📋 Funcionalidades Implementadas

### ✅ Email de Confirmação
- **Reservas Normais**: Email com detalhes da reserva, mesa, área
- **Reservas Grandes**: Email especial para grupos 16+ pessoas
- **Templates HTML**: Emails responsivos e profissionais

### ✅ WhatsApp de Confirmação
- **Reservas Normais**: Mensagem com detalhes da reserva
- **Reservas Grandes**: Mensagem especial para grupos grandes
- **Formatação**: Mensagens bem formatadas com emojis

### ✅ Notificações Admin
- **Email para Admin**: Notificação quando nova reserva é criada
- **Diferenciação**: Cores diferentes para reservas normais vs grandes
- **Detalhes Completos**: Todos os dados da reserva

## 🔧 Como Funciona

1. **Cliente faz reserva** no site (`/reservar`)
2. **Sistema detecta** se é reserva normal ou grande (16+ pessoas)
3. **Envia notificações**:
   - Email para o cliente
   - WhatsApp para o cliente (se configurado)
   - Email para o admin
4. **Logs** são gerados para acompanhar o status

## 🚨 Troubleshooting

### Email não está sendo enviado:
- Verifique as credenciais SMTP
- Confirme se a senha de app está correta
- Verifique se o Gmail permite apps menos seguros

### WhatsApp não está funcionando:
- Verifique as credenciais do Twilio
- Confirme se o WhatsApp Sandbox está ativo
- Verifique se o número está no formato correto

### Logs:
- Verifique os logs do servidor para erros
- As notificações são enviadas de forma assíncrona
- Falhas não impedem a criação da reserva

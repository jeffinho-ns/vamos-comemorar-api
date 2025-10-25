# 📧 Configuração de Notificações

Para que o sistema de notificações (email e WhatsApp) funcione, você precisa configurar as seguintes variáveis de ambiente no arquivo `.env`:

## 📧 Configuração de Email (Resend)

```env
# Email Configuration
RESEND_API_KEY=sua_chave_api_resend_aqui
ADMIN_EMAIL=reservas@grupoideiaum.com.br
```

### Para Resend:
1. Crie uma conta no [Resend](https://resend.com)
2. Verifique seu domínio de e-mail (ex: grupoideiaum.com.br)
3. Gere uma API Key no painel do Resend
4. Adicione a chave no campo `RESEND_API_KEY`
5. Configure o e-mail do administrador em `ADMIN_EMAIL`

**Nota:** O Resend é mais confiável e simples que SMTP tradicional, com melhor entregabilidade.

## 📱 Configuração de WhatsApp (Twilio)

```env
# WhatsApp Configuration
TWILIO_ACCOUNT_SID=seu_account_sid
TWILIO_AUTH_TOKEN=seu_auth_token
TWILIO_PHONE_NUMBER=+14155238886
```

### Para Twilio:
1. Crie uma conta no [Twilio](https://www.twilio.com)
2. Ative o WhatsApp Sandbox (para testes) ou configure um número oficial
3. Copie o Account SID e Auth Token do painel
4. Use o número fornecido pelo Twilio no campo `TWILIO_PHONE_NUMBER`

**Importante:** Certifique-se de que as credenciais estão corretas no servidor de produção.

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
- ✅ Verifique se `RESEND_API_KEY` está configurada no arquivo `.env` do servidor
- ✅ Confirme se a chave da API Resend está correta e ativa
- ✅ Verifique se o domínio foi verificado no Resend (ex: grupoideiaum.com.br)
- ✅ Verifique os logs do servidor: procure por "⚠️ AVISO: RESEND_API_KEY não foi encontrada"
- ✅ Teste manualmente: veja seção "🧪 Teste das Notificações" acima

### WhatsApp não está funcionando:
- ✅ Verifique se todas as variáveis Twilio estão configuradas: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- ✅ Confirme se o WhatsApp Sandbox está ativo (para testes) ou se você tem um número oficial aprovado
- ✅ Verifique se o número está no formato correto: +14155238886 (com + e código do país)
- ✅ Verifique os logs do servidor: procure por "⚠️ AVISO: As credenciais da Twilio não foram encontradas"
- ✅ Teste o número do cliente: deve ser formato brasileiro (+55XXXXXXXXXXX)

### Logs:
- ✅ Verifique os logs do servidor para mensagens de erro
- ✅ As notificações são enviadas de forma assíncrona (não bloqueiam a criação da reserva)
- ✅ Falhas no envio de notificações não impedem a criação da reserva
- ✅ Procure por mensagens que começam com "✅" (sucesso) ou "❌" (erro)

### Como verificar se está funcionando:
1. **No início do servidor**, você deve ver:
   ```
   ✅ Serviço de e-mail (Resend) configurado.
   ✅ Serviço de WhatsApp (Twilio) configurado.
   ```

2. **Se algum serviço não estiver configurado**, verá:
   ```
   ⚠️ AVISO: RESEND_API_KEY não foi encontrada. O serviço de e-mail está desativado.
   ⚠️ AVISO: As credenciais da Twilio não foram encontradas. O serviço de WhatsApp está desativado.
   ```

3. **Ao criar uma reserva**, você deve ver:
   ```
   ✅ Email de confirmação enviado via Resend! ID: [id]
   ✅ WhatsApp de confirmação enviado para whatsapp:+55... SID: [sid]
   ✅ Notificação admin enviada
   ```








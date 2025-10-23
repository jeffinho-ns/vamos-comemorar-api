# Sistema de Reservas Grandes

## Funcionalidades Implementadas

### 1. Banco de Dados
- ✅ Tabela `large_reservations` criada
- ✅ Suporte a reservas acima de 15 pessoas
- ✅ Campos para mesas selecionadas pelo admin
- ✅ Controle de origem (CLIENTE/ADMIN)

### 2. Backend API
- ✅ Endpoint `/api/large-reservations` com CRUD completo
- ✅ Validação de reservas grandes (acima de 15 pessoas)
- ✅ Integração com sistema de áreas e mesas
- ✅ Notificações automáticas por email e WhatsApp

### 3. Frontend Admin
- ✅ Nova aba "Reservas Grandes" no painel administrativo
- ✅ Modal para criar/editar reservas grandes
- ✅ Seleção de mesas específicas pelo admin
- ✅ Controle de status e check-in/check-out
- ✅ Interface diferenciada para reservas grandes

### 4. Frontend Cliente
- ✅ Página dedicada para reservas grandes (`/reservas-grandes`)
- ✅ Formulário simplificado (apenas escolha de área)
- ✅ Validações específicas para grupos grandes
- ✅ Modal de confirmação com feedback visual

### 5. Sistema de Notificações
- ✅ Email de confirmação para o cliente
- ✅ WhatsApp de confirmação para o cliente
- ✅ Notificação para o admin sobre nova reserva
- ✅ Templates HTML responsivos

## Como Configurar as Notificações

### 1. Configuração do Email (Gmail)

1. Ative a autenticação de 2 fatores na sua conta Gmail
2. Gere uma senha de aplicativo:
   - Vá para Configurações da Conta > Segurança
   - Em "Senhas de aplicativo", gere uma nova senha
   - Use essa senha no campo `SMTP_PASS`

3. Configure as variáveis de ambiente:
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu-email@gmail.com
SMTP_PASS=sua-senha-de-app
ADMIN_EMAIL=admin@vamoscomemorar.com
```

### 2. Configuração do WhatsApp (Twilio)

1. Crie uma conta no Twilio (https://www.twilio.com)
2. Configure o WhatsApp Sandbox:
   - Acesse Console > Messaging > Try it out > Send a WhatsApp message
   - Siga as instruções para configurar o sandbox

3. Configure as variáveis de ambiente:
```bash
TWILIO_ACCOUNT_SID=seu-account-sid
TWILIO_AUTH_TOKEN=seu-auth-token
TWILIO_WHATSAPP_NUMBER=+14155238886
```

### 3. Executar Migração do Banco

Execute o script de migração para criar a tabela:
```sql
-- Execute o arquivo: migrations/create_large_reservations_table.sql
```

## Como Usar

### Para o Admin:
1. Acesse o painel administrativo
2. Selecione um estabelecimento
3. Vá para a aba "Reservas Grandes"
4. Clique em "Nova Reserva Grande"
5. Preencha os dados e selecione as mesas específicas
6. Salve a reserva

### Para o Cliente:
1. Acesse `/reservas-grandes`
2. Preencha o formulário com os dados do grupo
3. Selecione a área preferencial
4. Envie a solicitação
5. Aguarde confirmação por email e WhatsApp

## Fluxo de Funcionamento

1. **Cliente solicita reserva grande** → Sistema valida dados
2. **Sistema cria reserva** → Status: NOVA
3. **Notificações enviadas** → Email e WhatsApp para cliente
4. **Admin notificado** → Email para admin sobre nova reserva
5. **Admin pode editar** → Selecionar mesas específicas, adicionar notas
6. **Status atualizado** → CONFIRMADA quando admin aprovar
7. **Check-in/Check-out** → Controle de presença no dia

## Estrutura dos Dados

### Tabela `large_reservations`
- `id`: ID único da reserva
- `establishment_id`: ID do estabelecimento
- `client_name`: Nome do cliente
- `client_phone`: Telefone do cliente
- `client_email`: Email do cliente
- `reservation_date`: Data da reserva
- `reservation_time`: Horário da reserva
- `number_of_people`: Número de pessoas (mínimo 16)
- `area_id`: ID da área selecionada
- `selected_tables`: JSON com IDs das mesas selecionadas pelo admin
- `status`: NOVA, CONFIRMADA, CANCELADA, CHECKED_IN, COMPLETED
- `origin`: CLIENTE ou ADMIN
- `notes`: Observações do cliente
- `admin_notes`: Notas internas do admin
- `email_sent`: Flag se email foi enviado
- `whatsapp_sent`: Flag se WhatsApp foi enviado

## Próximos Passos Sugeridos

1. **Implementar sistema de aprovação** para reservas de cliente
2. **Adicionar integração com sistema de pagamento** para reservas grandes
3. **Criar relatórios específicos** para reservas grandes
4. **Implementar sistema de lembretes** automáticos
5. **Adicionar suporte a múltiplos estabelecimentos** nas notificações

## Troubleshooting

### Email não enviando:
- Verifique se as credenciais SMTP estão corretas
- Confirme se a senha de aplicativo está sendo usada
- Verifique se a autenticação de 2 fatores está ativa

### WhatsApp não enviando:
- Confirme se o sandbox do Twilio está configurado
- Verifique se o número está no formato correto
- Confirme se as credenciais do Twilio estão corretas

### Erro de banco de dados:
- Execute a migração da tabela `large_reservations`
- Verifique se as tabelas `restaurant_areas` e `restaurant_tables` existem
- Confirme as permissões do usuário do banco







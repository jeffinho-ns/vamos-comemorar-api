# 🚀 Deploy em Produção - Sistema de Reservas do Restaurante

## 📋 Pré-requisitos

1. **Servidor de Produção** (Render, Vercel, Heroku, etc.)
2. **Banco de Dados MySQL** configurado
3. **Variáveis de Ambiente** configuradas

## 🔧 Configuração do Servidor

### 1. Variáveis de Ambiente

Configure as seguintes variáveis no seu servidor de produção:

```bash
# Ambiente
NODE_ENV=production
PORT=10000

# Banco de Dados
DB_HOST=193.203.175.55
DB_USER=u621081794_vamos
DB_PASSWORD=@123Mudar!@
DB_NAME=u621081794_vamos

# FTP (opcional)
FTP_HOST=195.35.41.247
FTP_USER=u621081794
FTP_PASSWORD=Jeffl1ma!@
```

### 2. Executar Migrações do Banco

Execute o script SQL no seu banco de dados MySQL:

```sql
-- Execute o arquivo: migrations/add_checkin_checkout_fields.sql
```

### 3. Estrutura de Tabelas

O sistema criará automaticamente as seguintes tabelas se não existirem:

- `restaurant_reservations` - Reservas do restaurante
- `waitlist` - Lista de espera
- `walk_ins` - Passantes
- `restaurant_areas` - Áreas do restaurante

## 🎯 Endpoints da API

### Reservas do Restaurante

- `GET /api/restaurant-reservations` - Listar reservas
- `POST /api/restaurant-reservations` - Criar reserva
- `PUT /api/restaurant-reservations/:id` - Atualizar reserva
- `DELETE /api/restaurant-reservations/:id` - Deletar reserva
- `GET /api/restaurant-reservations/capacity/check` - Verificar capacidade

### Lista de Espera

- `GET /api/waitlist` - Listar fila de espera
- `POST /api/waitlist` - Adicionar à fila
- `PUT /api/waitlist/:id` - Atualizar entrada
- `PUT /api/waitlist/:id/call` - Chamar cliente

### Passantes

- `GET /api/walk-ins` - Listar passantes
- `POST /api/walk-ins` - Criar passante
- `PUT /api/walk-ins/:id` - Atualizar passante

### Áreas do Restaurante

- `GET /api/restaurant-areas` - Listar áreas
- `POST /api/restaurant-areas` - Criar área

## 🔄 Fluxo de Funcionamento

### 1. Nova Reserva
```
Cliente solicita reserva → Verificar capacidade → 
Se há fila de espera: Redirecionar para fila
Se não há fila: Criar reserva
```

### 2. Check-in/Check-out
```
Check-in: status = 'checked-in' + timestamp
Check-out: status = 'completed' + timestamp → Verificar fila de espera
```

### 3. Liberação de Mesa
```
Check-out → Verificar fila de espera → 
Chamar próximo cliente → Atualizar posições
```

## 📊 Monitoramento

### Health Check
```
GET /health
```

### Logs Importantes
- `🔔 Mesa liberada! Cliente chamado: [nome]`
- `✅ Reserva criada com sucesso`
- `❌ Erro ao verificar capacidade`

## 🛠️ Troubleshooting

### Problemas Comuns

1. **Erro de Conexão com Banco**
   - Verificar variáveis de ambiente
   - Testar conexão manual

2. **CORS Errors**
   - Verificar URLs permitidas em `config/production.js`

3. **Tabelas Não Existem**
   - Executar migrações manualmente
   - Verificar logs de criação de tabelas

### Comandos Úteis

```bash
# Testar conexão com banco
node -e "const pool = require('./config/database'); pool.execute('SELECT 1').then(() => console.log('OK')).catch(console.error)"

# Verificar variáveis de ambiente
node -e "console.log(process.env)"

# Executar servidor em modo debug
DEBUG=* node server.js
```

## 📈 Performance

### Otimizações Implementadas

1. **Índices de Banco**
   - `idx_reservation_date`
   - `idx_status`
   - `idx_establishment_id`

2. **Queries Otimizadas**
   - Verificação de capacidade em uma query
   - Atualização de status com timestamp

3. **Cache de Dados**
   - Atualização em tempo real a cada 30 segundos

## 🔐 Segurança

### Implementado

1. **Validação de Entrada**
   - Campos obrigatórios
   - Sanitização de dados

2. **Rate Limiting**
   - Configurado no servidor

3. **CORS Configurado**
   - URLs específicas permitidas

## 📞 Suporte

Para problemas ou dúvidas:
1. Verificar logs do servidor
2. Testar endpoints individualmente
3. Verificar configurações de banco
4. Consultar documentação da API


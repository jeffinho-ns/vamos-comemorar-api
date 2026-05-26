# Análise Completa: Sistema de Check-ins

## 📊 Status da Implementação

### ✅ O que já existe

1. **Tabelas do Banco de Dados**
   - `restaurant_reservations` - Reservas normais de mesas
   - `large_reservations` - Reservas grandes (11+ pessoas)
   - `guest_lists` - Listas de convidados
   - `guests` - Convidados das listas
   - `listas_convidados_eventos` - Convidados de eventos/promoters
   - `promoter_eventos` - Relação promoters x eventos

2. **Endpoints de Check-in Existentes**
   - ✅ `POST /api/admin/guests/:id/checkin` - Check-in de convidado de lista
   - ✅ `POST /api/restaurant-reservations/:id/checkin-owner` - Check-in do dono da lista
   - ✅ `PUT /api/v1/eventos/checkin/:listaConvidadoId` - Check-in de convidado de promoter

### ⚠️ O que estava faltando (AGORA CORRIGIDO)

1. **Campos no Banco de Dados**
   - ❌ Campo `checked_in` nas tabelas de reservas
   - ❌ Campo `checkin_time` nas tabelas de reservas
   - ❌ Campos de check-in na tabela `guests`
   - ❌ Campos de check-in do dono em `guest_lists`

2. **Endpoints de Check-in**
   - ❌ Check-in de reserva normal (`restaurant_reservations`)
   - ❌ Check-in de reserva grande (`large_reservations`)

---

## 🔧 Correções Implementadas

### 1. Migração SQL Completa

**Arquivo:** `migrations/add_checkin_fields_complete.sql`

Este arquivo adiciona todos os campos necessários:

```sql
-- restaurant_reservations
ALTER TABLE `restaurant_reservations` 
ADD COLUMN IF NOT EXISTS `checked_in` TINYINT(1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS `checkin_time` TIMESTAMP NULL DEFAULT NULL;

-- large_reservations
ALTER TABLE `large_reservations`
ADD COLUMN IF NOT EXISTS `checked_in` TINYINT(1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS `checkin_time` TIMESTAMP NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS `event_type` VARCHAR(100) DEFAULT NULL;

-- guests
ALTER TABLE `guests`
ADD COLUMN IF NOT EXISTS `checked_in` TINYINT(1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS `checkin_time` TIMESTAMP NULL DEFAULT NULL;

-- guest_lists
ALTER TABLE `guest_lists`
ADD COLUMN IF NOT EXISTS `owner_checked_in` TINYINT(1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS `owner_checkin_time` TIMESTAMP NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS `establishment_id` INT(11) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS `created_by` INT(11) DEFAULT NULL;

-- promoter_eventos
ALTER TABLE `promoter_eventos`
ADD COLUMN IF NOT EXISTS `checked_in` TINYINT(1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS `checkin_time` TIMESTAMP NULL DEFAULT NULL;
```

### 2. Novos Endpoints Criados

#### A. Check-in de Reserva Normal
**Arquivo:** `routes/restaurantReservations.js`

```javascript
POST /api/restaurant-reservations/:id/checkin
```

**Função:**
- Faz check-in do dono da reserva normal
- Atualiza `checked_in = 1` e `checkin_time = CURRENT_TIMESTAMP`
- Retorna confirmação com horário do check-in

**Uso no Frontend:**
```javascript
const response = await fetch(`${API_URL}/api/restaurant-reservations/${reservation.id}/checkin`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
});
```

#### B. Check-in de Reserva Grande
**Arquivo:** `routes/largeReservations.js`

```javascript
POST /api/large-reservations/:id/checkin
```

**Função:**
- Faz check-in do dono da reserva grande
- Atualiza `checked_in = 1`, `checkin_time = CURRENT_TIMESTAMP` e `status = 'CHECKED_IN'`
- Retorna confirmação com horário do check-in

**Uso no Frontend:**
```javascript
const response = await fetch(`${API_URL}/api/large-reservations/${reservation.id}/checkin`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
});
```

---

## 📋 Fluxo Completo de Check-ins

### 1. Reservas de Mesas (Restaurant Reservations)

```
Frontend → POST /api/restaurant-reservations/:id/checkin
         ↓
Backend atualiza: checked_in = 1, checkin_time = NOW()
         ↓
Frontend recebe confirmação
         ↓
Card fica verde na interface
```

### 2. Reservas Grandes (Large Reservations)

```
Frontend → POST /api/large-reservations/:id/checkin
         ↓
Backend atualiza: checked_in = 1, checkin_time = NOW(), status = 'CHECKED_IN'
         ↓
Frontend recebe confirmação
         ↓
Card fica verde na interface
```

### 3. Convidados de Listas de Reservas

```
Frontend → POST /api/admin/guests/:id/checkin
         ↓
Backend atualiza: checked_in = 1, checkin_time = NOW()
         ↓
Frontend recebe confirmação
         ↓
Card fica verde na interface
```

### 4. Convidados de Promoters (Eventos)

```
Frontend → PUT /api/v1/eventos/checkin/:listaConvidadoId
         ↓
Backend atualiza: status_checkin = 'Check-in', data_checkin = NOW()
         ↓
Frontend recebe confirmação
         ↓
Card fica verde na interface
```

---

## 🗄️ Estrutura do Banco de Dados

### Tabela: restaurant_reservations
```sql
id INT PRIMARY KEY
client_name VARCHAR(255)
reservation_date DATE
reservation_time TIME
checked_in TINYINT(1) DEFAULT 0      -- ✅ NOVO
checkin_time TIMESTAMP NULL           -- ✅ NOVO
establishment_id INT
...
```

### Tabela: large_reservations
```sql
id INT PRIMARY KEY
client_name VARCHAR(255)
reservation_date DATE
reservation_time TIME
number_of_people INT
event_type VARCHAR(100)               -- ✅ NOVO
checked_in TINYINT(1) DEFAULT 0       -- ✅ NOVO
checkin_time TIMESTAMP NULL           -- ✅ NOVO
establishment_id INT
...
```

### Tabela: guests
```sql
id INT PRIMARY KEY
guest_list_id INT
name VARCHAR(255)
whatsapp VARCHAR(30)
checked_in TINYINT(1) DEFAULT 0       -- ✅ NOVO
checkin_time TIMESTAMP NULL           -- ✅ NOVO
...
```

### Tabela: guest_lists
```sql
id INT PRIMARY KEY
reservation_id INT
reservation_type ENUM('restaurant','large')
owner_checked_in TINYINT(1) DEFAULT 0 -- ✅ NOVO
owner_checkin_time TIMESTAMP NULL     -- ✅ NOVO
establishment_id INT                  -- ✅ NOVO
created_by INT                        -- ✅ NOVO
shareable_link_token VARCHAR(64)
...
```

### Tabela: listas_convidados_eventos
```sql
lista_convidado_id INT PRIMARY KEY
lista_id INT
nome_convidado VARCHAR(255)
telefone_convidado VARCHAR(20)
status_checkin ENUM('Pendente','Check-in','No-Show')  -- ✅ JÁ EXISTE
data_checkin TIMESTAMP NULL                            -- ✅ JÁ EXISTE
is_vip TINYINT(1)
...
```

### Tabela: promoter_eventos
```sql
id INT PRIMARY KEY
promoter_id INT
evento_id INT
data_evento DATE
checked_in TINYINT(1) DEFAULT 0       -- ✅ NOVO
checkin_time TIMESTAMP NULL           -- ✅ NOVO
...
```

---

## 🚀 Instruções para Deploy

### Passo 1: Executar Migração SQL

```bash
# Conecte ao MySQL
mysql -u seu_usuario -p nome_do_banco

# Execute a migração
source migrations/add_checkin_fields_complete.sql

# Verifique se os campos foram criados
DESCRIBE restaurant_reservations;
DESCRIBE large_reservations;
DESCRIBE guests;
DESCRIBE guest_lists;
DESCRIBE promoter_eventos;
```

### Passo 2: Reiniciar o Backend

```bash
# No diretório vamos-comemorar-api
pm2 restart vamos-api
# OU
npm restart
```

### Passo 3: Verificar Logs

```bash
# Monitorar logs do backend
pm2 logs vamos-api

# Testar endpoints
curl -X POST http://localhost:5000/api/restaurant-reservations/1/checkin \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json"
```

### Passo 4: Deploy do Frontend

O frontend já está preparado! A página `/admin/checkins` já usa todos os endpoints corretos.

```bash
# No diretório vamos-comemorar-next
npm run build
# Deploy via Vercel ou seu método preferido
```

---

## 🔍 Validação

### 1. Verificar Campos no Banco
Execute este SQL para validar:

```sql
SELECT 
    'restaurant_reservations' as tabela,
    COLUMN_NAME,
    COLUMN_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME = 'restaurant_reservations'
AND COLUMN_NAME IN ('checked_in', 'checkin_time')
UNION ALL
SELECT 
    'large_reservations' as tabela,
    COLUMN_NAME,
    COLUMN_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME = 'large_reservations'
AND COLUMN_NAME IN ('checked_in', 'checkin_time', 'event_type')
UNION ALL
SELECT 
    'guests' as tabela,
    COLUMN_NAME,
    COLUMN_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME = 'guests'
AND COLUMN_NAME IN ('checked_in', 'checkin_time');
```

**Resultado Esperado:**
- `restaurant_reservations.checked_in` → TINYINT(1)
- `restaurant_reservations.checkin_time` → TIMESTAMP
- `large_reservations.checked_in` → TINYINT(1)
- `large_reservations.checkin_time` → TIMESTAMP
- `large_reservations.event_type` → VARCHAR(100)
- `guests.checked_in` → TINYINT(1)
- `guests.checkin_time` → TIMESTAMP

### 2. Testar Endpoints

#### A. Teste de Reserva Normal
```bash
curl -X POST "http://localhost:5000/api/restaurant-reservations/1/checkin" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json"
```

**Resposta Esperada:**
```json
{
  "success": true,
  "message": "Check-in da reserva confirmado com sucesso",
  "reservation": {
    "id": 1,
    "client_name": "João Silva",
    "checked_in": true,
    "checkin_time": "2024-10-28T14:30:00.000Z"
  }
}
```

#### B. Teste de Reserva Grande
```bash
curl -X POST "http://localhost:5000/api/large-reservations/1/checkin" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json"
```

**Resposta Esperada:**
```json
{
  "success": true,
  "message": "Check-in da reserva grande confirmado com sucesso",
  "reservation": {
    "id": 1,
    "client_name": "Maria Santos",
    "checked_in": true,
    "checkin_time": "2024-10-28T14:30:00.000Z"
  }
}
```

#### C. Teste de Convidado
```bash
curl -X POST "http://localhost:5000/api/admin/guests/1/checkin" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json"
```

**Resposta Esperada:**
```json
{
  "success": true,
  "message": "Check-in do convidado confirmado com sucesso",
  "guest": {
    "id": 1,
    "name": "Carlos Oliveira",
    "checked_in": true,
    "checkin_time": "2024-10-28T14:30:00.000Z"
  }
}
```

---

## 📊 Mapeamento Completo de APIs

### Reservas Normais
| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/restaurant-reservations` | GET | Listar reservas (filtros: date, establishment_id) |
| `/api/restaurant-reservations/:id` | GET | Buscar uma reserva |
| `/api/restaurant-reservations/:id/checkin` | POST | ✅ **Check-in da reserva** |
| `/api/restaurant-reservations/:id/checkin-owner` | POST | Check-in do dono da lista |
| `/api/restaurant-reservations/:id/guest-list` | GET | Buscar lista de convidados |

### Reservas Grandes
| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/large-reservations` | GET | Listar reservas grandes (filtros: date, establishment_id) |
| `/api/large-reservations/:id` | GET | Buscar uma reserva grande |
| `/api/large-reservations/:id/checkin` | POST | ✅ **Check-in da reserva grande** |

### Listas de Convidados
| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/admin/guest-lists` | GET | Listar listas (filtros: month, establishment_id) |
| `/api/admin/guest-lists/:id/guests` | GET | Buscar convidados da lista |
| `/api/admin/guests/:id/checkin` | POST | ✅ **Check-in de convidado** |
| `/api/admin/guest-lists/:id/checkin-status` | GET | Status de check-in da lista |

### Eventos e Promoters
| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/v1/eventos` | GET | Listar eventos (filtros: date) |
| `/api/v1/eventos/:id/promoters` | GET | Listar promoters do evento |
| `/api/v1/eventos/:id/promoter/:promoterId/listas` | GET | Listas do promoter |
| `/api/v1/eventos/checkin/:convidadoId` | PUT | ✅ **Check-in de convidado de promoter** |

---

## ✅ Checklist Final

- [x] Criar migração SQL com todos os campos necessários
- [x] Adicionar endpoint de check-in para `restaurant_reservations`
- [x] Adicionar endpoint de check-in para `large_reservations`
- [x] Documentar estrutura completa do banco de dados
- [x] Documentar todos os endpoints disponíveis
- [x] Criar guia de validação e testes
- [x] Criar instruções de deploy

---

## 🎯 Próximos Passos

1. **Execute a migração SQL no banco de produção**
   ```bash
   mysql -u usuario -p banco < migrations/add_checkin_fields_complete.sql
   ```

2. **Reinicie o backend**
   ```bash
   pm2 restart vamos-api
   ```

3. **Teste no ambiente de staging/produção**
   - Acesse `/admin/checkins`
   - Teste cada tipo de check-in
   - Verifique se os dados persistem no banco

4. **Monitore os logs**
   ```bash
   pm2 logs vamos-api --lines 100
   ```

---

## 📝 Notas Importantes

1. **Compatibilidade:** Todos os campos usam `ADD COLUMN IF NOT EXISTS`, então é seguro executar a migração múltiplas vezes

2. **Índices:** A migração cria índices para melhorar a performance das consultas de check-in

3. **Retrocompatibilidade:** O código funciona mesmo que alguns campos não existam (usa verificações)

4. **Status de Reservas Grandes:** O check-in atualiza automaticamente o status para `CHECKED_IN`

---

**Desenvolvido em:** 28/10/2024  
**Versão:** 1.0  
**Status:** ✅ Pronto para produção


# Sistema de Reservas do Restaurante - API Backend

## Visão Geral

Este documento descreve todos os endpoints implementados no backend `vamos-comemorar-api` para o sistema de reservas do restaurante.

## Base URL

```
https://vamos-comemorar-api.onrender.com
```

## Endpoints Implementados

### 1. Reservas do Restaurante

#### GET `/api/restaurant-reservations`
Lista todas as reservas com filtros opcionais.

**Query Parameters:**
- `date` (string): Filtrar por data específica (YYYY-MM-DD)
- `status` (string): Filtrar por status (NOVA, CONFIRMADA, CANCELADA, CONCLUIDA, NO_SHOW)
- `area_id` (number): Filtrar por área específica
- `limit` (number): Limitar número de resultados
- `sort` (string): Campo para ordenação
- `order` (string): Direção da ordenação (ASC, DESC)

**Resposta:**
```json
{
  "success": true,
  "reservations": [
    {
      "id": 1,
      "client_name": "João Silva",
      "client_phone": "(11) 99999-9999",
      "client_email": "joao@email.com",
      "reservation_date": "2024-01-15",
      "reservation_time": "19:30:00",
      "number_of_people": 4,
      "area_id": 1,
      "table_number": "Mesa 5",
      "status": "CONFIRMADA",
      "origin": "PESSOAL",
      "notes": "Aniversário",
      "created_by": 1,
      "created_at": "2024-01-10T10:00:00.000Z",
      "updated_at": "2024-01-10T10:00:00.000Z",
      "area_name": "Área Coberta",
      "created_by_name": "Admin"
    }
  ]
}
```

#### GET `/api/restaurant-reservations/:id`
Busca uma reserva específica.

#### POST `/api/restaurant-reservations`
Cria uma nova reserva.

**Body:**
```json
{
  "client_name": "João Silva",
  "client_phone": "(11) 99999-9999",
  "client_email": "joao@email.com",
  "reservation_date": "2024-01-15",
  "reservation_time": "19:30:00",
  "number_of_people": 4,
  "area_id": 1,
  "table_number": "Mesa 5",
  "status": "NOVA",
  "origin": "PESSOAL",
  "notes": "Aniversário",
  "created_by": 1
}
```

#### PUT `/api/restaurant-reservations/:id`
Atualiza uma reserva existente.

#### DELETE `/api/restaurant-reservations/:id`
Deleta uma reserva.

#### GET `/api/restaurant-reservations/stats/dashboard`
Busca estatísticas para o dashboard.

**Resposta:**
```json
{
  "success": true,
  "stats": {
    "totalReservations": 150,
    "todayReservations": 12,
    "occupancyRate": 75
  }
}
```

### 2. Passantes (Walk-ins)

#### GET `/api/walk-ins`
Lista todos os passantes com filtros opcionais.

**Query Parameters:**
- `status` (string): Filtrar por status (ATIVO, FINALIZADO, CANCELADO)
- `area_id` (number): Filtrar por área específica
- `date` (string): Filtrar por data (YYYY-MM-DD)
- `limit` (number): Limitar número de resultados
- `sort` (string): Campo para ordenação
- `order` (string): Direção da ordenação (ASC, DESC)

#### GET `/api/walk-ins/:id`
Busca um passante específico.

#### POST `/api/walk-ins`
Cria um novo passante.

**Body:**
```json
{
  "client_name": "Maria Santos",
  "client_phone": "(11) 88888-8888",
  "number_of_people": 2,
  "area_id": 1,
  "table_number": "Mesa 3",
  "status": "ATIVO",
  "notes": "Cliente VIP",
  "created_by": 1
}
```

#### PUT `/api/walk-ins/:id`
Atualiza um passante existente.

#### DELETE `/api/walk-ins/:id`
Deleta um passante.

#### GET `/api/walk-ins/stats/active`
Busca estatísticas de passantes ativos.

### 3. Lista de Espera

#### GET `/api/waitlist`
Lista todos os itens da lista de espera.

**Query Parameters:**
- `status` (string): Filtrar por status (AGUARDANDO, CHAMADO, ATENDIDO, CANCELADO)
- `limit` (number): Limitar número de resultados
- `sort` (string): Campo para ordenação
- `order` (string): Direção da ordenação (ASC, DESC)

#### GET `/api/waitlist/:id`
Busca um item específico da lista de espera.

#### POST `/api/waitlist`
Adiciona um novo item à lista de espera.

**Body:**
```json
{
  "client_name": "Pedro Costa",
  "client_phone": "(11) 77777-7777",
  "client_email": "pedro@email.com",
  "number_of_people": 3,
  "preferred_time": "20:00:00",
  "status": "AGUARDANDO",
  "notes": "Preferência por mesa na janela"
}
```

#### PUT `/api/waitlist/:id`
Atualiza um item da lista de espera.

#### DELETE `/api/waitlist/:id`
Remove um item da lista de espera.

#### PUT `/api/waitlist/:id/call`
Marca um item como chamado.

#### GET `/api/waitlist/stats/count`
Busca contagem de itens na lista de espera.

### 4. Áreas do Restaurante

#### GET `/api/restaurant-areas`
Lista todas as áreas do restaurante.

**Resposta:**
```json
{
  "success": true,
  "areas": [
    {
      "id": 1,
      "name": "Área Coberta",
      "description": "Área interna com ar condicionado",
      "capacity_lunch": 50,
      "capacity_dinner": 40,
      "is_active": 1,
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z",
      "active_reservations": 5,
      "active_walk_ins": 2
    }
  ]
}
```

#### GET `/api/restaurant-areas/:id`
Busca uma área específica.

#### POST `/api/restaurant-areas`
Cria uma nova área.

**Body:**
```json
{
  "name": "Área Descoberta",
  "description": "Área externa com vista para o jardim",
  "capacity_lunch": 30,
  "capacity_dinner": 25,
  "is_active": 1
}
```

#### PUT `/api/restaurant-areas/:id`
Atualiza uma área existente.

#### DELETE `/api/restaurant-areas/:id`
Desativa uma área (soft delete).

#### GET `/api/restaurant-areas/:id/availability`
Verifica disponibilidade de uma área em uma data específica.

**Query Parameters:**
- `date` (string): Data para verificar disponibilidade (YYYY-MM-DD)

### 5. Datas Especiais

#### GET `/api/special-dates`
Lista todas as datas especiais.

**Query Parameters:**
- `year` (number): Filtrar por ano
- `month` (number): Filtrar por mês
- `is_blocked` (boolean): Filtrar por datas bloqueadas

#### GET `/api/special-dates/:id`
Busca uma data especial específica.

#### POST `/api/special-dates`
Cria uma nova data especial.

**Body:**
```json
{
  "name": "Dia dos Namorados",
  "date": "2024-06-12",
  "capacity_lunch": 100,
  "capacity_dinner": 80,
  "is_blocked": 0,
  "description": "Data especial com menu especial"
}
```

#### PUT `/api/special-dates/:id`
Atualiza uma data especial existente.

#### DELETE `/api/special-dates/:id`
Deleta uma data especial.

#### GET `/api/special-dates/check/:date`
Verifica se uma data é especial.

#### GET `/api/special-dates/calendar/:year/:month`
Busca datas especiais de um mês específico para calendário.

### 6. Relatórios

#### GET `/api/reports/reservations`
Gera relatórios de reservas.

**Query Parameters:**
- `start_date` (string): Data inicial (YYYY-MM-DD)
- `end_date` (string): Data final (YYYY-MM-DD)
- `type` (string): Tipo de relatório (daily, weekly, monthly, custom)
- `area_id` (number): Filtrar por área
- `status` (string): Filtrar por status

**Resposta:**
```json
{
  "success": true,
  "report": {
    "period": {
      "start_date": "2024-01-01",
      "end_date": "2024-01-31",
      "type": "monthly"
    },
    "reservations": [...],
    "statistics": {
      "general": {
        "total_reservations": 150,
        "confirmed_reservations": 120,
        "cancelled_reservations": 15,
        "no_show_reservations": 10,
        "completed_reservations": 5,
        "total_people": 600,
        "avg_people_per_reservation": 4.0
      },
      "by_area": [...],
      "by_origin": [...],
      "by_day": [...]
    }
  }
}
```

#### GET `/api/reports/walk-ins`
Gera relatórios de passantes.

#### GET `/api/reports/waitlist`
Gera relatórios da lista de espera.

#### GET `/api/reports/dashboard`
Gera estatísticas para o dashboard.

## Códigos de Status HTTP

- `200` - Sucesso
- `201` - Criado com sucesso
- `400` - Erro de validação
- `404` - Recurso não encontrado
- `500` - Erro interno do servidor

## Estrutura de Resposta Padrão

### Sucesso
```json
{
  "success": true,
  "message": "Operação realizada com sucesso",
  "data": {...}
}
```

### Erro
```json
{
  "success": false,
  "error": "Mensagem de erro"
}
```

## Autenticação

Todos os endpoints requerem autenticação. O token deve ser enviado no header:

```
Authorization: Bearer <token>
```

## Validações

### Reservas
- `client_name`: Obrigatório
- `reservation_date`: Obrigatório, formato YYYY-MM-DD
- `reservation_time`: Obrigatório, formato HH:MM:SS
- `area_id`: Obrigatório, deve existir na tabela restaurant_areas
- `number_of_people`: Obrigatório, deve ser maior que 0

### Passantes
- `client_name`: Obrigatório
- `area_id`: Obrigatório, deve existir na tabela restaurant_areas
- `number_of_people`: Obrigatório, deve ser maior que 0

### Lista de Espera
- `client_name`: Obrigatório
- `number_of_people`: Obrigatório, deve ser maior que 0

### Áreas
- `name`: Obrigatório, deve ser único

### Datas Especiais
- `name`: Obrigatório
- `date`: Obrigatório, formato YYYY-MM-DD, deve ser único

## Exemplos de Uso

### Criar uma nova reserva
```bash
curl -X POST https://vamos-comemorar-api.onrender.com/api/restaurant-reservations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "client_name": "João Silva",
    "client_phone": "(11) 99999-9999",
    "reservation_date": "2024-01-15",
    "reservation_time": "19:30:00",
    "number_of_people": 4,
    "area_id": 1,
    "status": "NOVA",
    "origin": "PESSOAL"
  }'
```

### Buscar reservas de hoje
```bash
curl -X GET "https://vamos-comemorar-api.onrender.com/api/restaurant-reservations?date=2024-01-15" \
  -H "Authorization: Bearer <token>"
```

### Verificar disponibilidade de uma área
```bash
curl -X GET "https://vamos-comemorar-api.onrender.com/api/restaurant-areas/1/availability?date=2024-01-15" \
  -H "Authorization: Bearer <token>"
```

## Notas Importantes

1. **Soft Delete**: Áreas são desativadas (não deletadas fisicamente) para preservar histórico
2. **Posições na Lista de Espera**: Calculadas automaticamente baseadas na ordem de chegada
3. **Tempo de Espera**: Estimado automaticamente (15 minutos por pessoa na frente)
4. **Estatísticas**: Calculadas em tempo real baseadas nos dados atuais
5. **Filtros**: Todos os endpoints de listagem suportam filtros opcionais
6. **Paginação**: Suportada através do parâmetro `limit`
7. **Ordenação**: Suportada através dos parâmetros `sort` e `order`

## Próximos Passos

1. Implementar autenticação e autorização
2. Adicionar validações mais robustas
3. Implementar cache para consultas frequentes
4. Adicionar logs de auditoria
5. Implementar notificações em tempo real
6. Adicionar exportação de relatórios em PDF/Excel

































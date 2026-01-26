# Tabela de Check-outs - Documentação

## 📋 Visão Geral

A tabela `checkouts` foi criada para armazenar o histórico completo de check-outs de forma permanente, garantindo que o status "Concluído" seja mantido mesmo após recarregamentos da página.

## 🗄️ Estrutura da Tabela

### Campos Principais

- **`id`**: ID único do registro de check-out
- **`checkout_type`**: Tipo de check-out (`owner`, `guest`, `reservation`)
- **`entity_type`**: Tipo de entidade (`guest_list`, `guest`, `restaurant_reservation`, `large_reservation`)
- **`entity_id`**: ID da entidade que fez check-out
- **`name`**: Nome da pessoa que fez check-out
- **`checkin_time`**: Horário de check-in
- **`checkout_time`**: Horário de check-out
- **`status`**: Status do check-out (`concluido`, `cancelado`)

### Campos de Contexto

- **`guest_list_id`**: ID da guest list (se aplicável)
- **`reservation_id`**: ID da reserva (se aplicável)
- **`table_number`**: Número da mesa
- **`area_name`**: Nome da área
- **`establishment_id`**: ID do estabelecimento
- **`evento_id`**: ID do evento

### Campos de Entrada

- **`entrada_tipo`**: Tipo de entrada (`VIP`, `SECO`, `CONSUMA`)
- **`entrada_valor`**: Valor pago na entrada

## 🔧 Como Usar

### 1. Executar a Migração

```sql
-- Execute o arquivo de migração
SOURCE migrations/create_checkouts_table.sql;
```

### 2. Registrar Check-out do Dono

```sql
INSERT INTO checkouts (
  checkout_type,
  entity_type,
  entity_id,
  name,
  checkin_time,
  checkout_time,
  status,
  guest_list_id,
  reservation_id,
  table_number,
  area_name,
  establishment_id,
  evento_id
) VALUES (
  'owner',
  'guest_list',
  :guest_list_id,
  :owner_name,
  :checkin_time,
  NOW(),
  'concluido',
  :guest_list_id,
  :reservation_id,
  :table_number,
  :area_name,
  :establishment_id,
  :evento_id
);
```

### 3. Registrar Check-out de Convidado

```sql
INSERT INTO checkouts (
  checkout_type,
  entity_type,
  entity_id,
  name,
  checkin_time,
  checkout_time,
  status,
  guest_list_id,
  entrada_tipo,
  entrada_valor
) VALUES (
  'guest',
  'guest',
  :guest_id,
  :guest_name,
  :checkin_time,
  NOW(),
  'concluido',
  :guest_list_id,
  :entrada_tipo,
  :entrada_valor
);
```

### 4. Consultar Check-outs Concluídos

```sql
-- Todos os check-outs de um evento
SELECT * FROM checkouts 
WHERE evento_id = :evento_id 
AND status = 'concluido'
ORDER BY checkout_time DESC;

-- Check-outs de uma guest list
SELECT * FROM checkouts 
WHERE guest_list_id = :guest_list_id 
AND status = 'concluido'
ORDER BY checkout_time DESC;

-- Histórico completo de um estabelecimento
SELECT * FROM checkouts 
WHERE establishment_id = :establishment_id 
AND status = 'concluido'
AND DATE(checkout_time) = :date
ORDER BY checkout_time DESC;
```

## 🔄 Integração com Backend

### Endpoints que devem usar a tabela:

1. **POST /api/admin/guest-lists/:id/owner-checkout**
   - Registrar check-out do dono na tabela `checkouts`

2. **POST /api/admin/guests/:id/checkout**
   - Registrar check-out do convidado na tabela `checkouts`

3. **GET /api/admin/checkouts**
   - Buscar histórico de check-outs
   - Parâmetros: `evento_id`, `guest_list_id`, `establishment_id`, `date`

## ✅ Benefícios

1. **Persistência Permanente**: Dados não são perdidos após recarregamento
2. **Histórico Completo**: Mantém registro de todos os check-outs
3. **Consultas Eficientes**: Índices otimizados para buscas rápidas
4. **Auditoria**: Rastreabilidade completa de check-ins e check-outs
5. **Relatórios**: Facilita geração de relatórios e estatísticas

## 📊 Exemplo de Uso no Frontend

```typescript
// Carregar histórico de check-outs
const loadCheckouts = async (eventoId: number) => {
  const response = await fetch(`${API_URL}/api/admin/checkouts?evento_id=${eventoId}`);
  const data = await response.json();
  return data.checkouts; // Array de check-outs concluídos
};

// O histórico será sempre carregado do banco, garantindo persistência
```

## 🔍 Manutenção

- A tabela cresce com o tempo, considere arquivar dados antigos periodicamente
- Use os índices para otimizar consultas
- O campo `status` permite cancelar check-outs se necessário (soft delete)


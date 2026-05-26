# 🎁 Sistema de Brindes - Implementação

## 📋 Resumo

Sistema de regras de brindes configuráveis por estabelecimento/evento que libera brindes automaticamente quando uma quantidade mínima de check-ins é atingida em uma lista de convidados (guest list).

## ✅ O que foi implementado

### 1. Banco de Dados

**Arquivo:** `migrations/create_gift_rules_system.sql`

- Tabela `gift_rules`: Armazena regras de brindes configuráveis
  - `establishment_id`: ID do estabelecimento
  - `evento_id`: ID do evento (opcional, NULL = todos os eventos)
  - `descricao`: Descrição do brinde (ex: "1 drink", "4 cervejas")
  - `checkins_necessarios`: Quantidade de check-ins necessários
  - `status`: ATIVA ou INATIVA

- Tabela `guest_list_gifts`: Armazena brindes liberados
  - `guest_list_id`: ID da lista de convidados
  - `gift_rule_id`: ID da regra que foi atingida
  - `status`: LIBERADO, ENTREGUE ou CANCELADO
  - `checkins_count`: Quantidade de check-ins quando foi liberado
  - `liberado_em`: Data/hora da liberação
  - `entregue_em`: Data/hora da entrega (se entregue)

### 2. Backend

**Arquivo:** `routes/giftRules.js`

Endpoints criados:
- `GET /api/gift-rules` - Lista regras (filtros: establishment_id, evento_id)
- `GET /api/gift-rules/:id` - Busca uma regra específica
- `POST /api/gift-rules` - Cria uma nova regra
- `PUT /api/gift-rules/:id` - Atualiza uma regra
- `DELETE /api/gift-rules/:id` - Deleta uma regra
- `GET /api/gift-rules/guest-list/:guestListId/gifts` - Busca brindes liberados de uma lista
- `PUT /api/gift-rules/gifts/:giftId/deliver` - Marca brinde como entregue

**Função de verificação:**
- `checkAndAwardGifts(guestListId)`: Verifica check-ins e libera brindes automaticamente

**Integração:**
- Integrada no endpoint `POST /api/admin/guests/:id/checkin` (guestListsAdmin.js)
- Verifica e libera brindes automaticamente após cada check-in

### 3. Registro no Servidor

**Arquivo:** `server.js`
- Rota `/api/gift-rules` registrada

## 🔧 Próximos Passos

### Frontend - Interface de Gerenciamento

Adicionar na página `/admin/restaurant-reservations` na aba **Configurações**:

1. Seção "Regras de Brindes"
2. Lista de regras existentes com opções de editar/ativar/desativar/deletar
3. Formulário para criar nova regra com:
   - Descrição do brinde
   - Quantidade de check-ins necessários
   - Status (ATIVA/INATIVA)

### Frontend - Página de Check-ins

Adicionar na página `/admin/eventos/[id]/check-ins` na seção de **Lista de Convidados - Reservas Aniversário**:

1. Barra de progresso mostrando porcentagem de check-ins
2. Indicador quando atingir 80% da meta (ex: 20 check-ins)
3. Mensagem de brinde liberado quando a meta for atingida
4. Exibição de qual brinde está disponível

## 📊 Fluxo de Funcionamento

1. **Admin cria regras** na página de configurações do restaurante
   - Exemplo: "5 check-ins = 1 drink"
   - Exemplo: "20 check-ins = 1 garrafa de licor Rufus"

2. **Convidados fazem check-in** na página de check-ins do evento

3. **Sistema verifica automaticamente** após cada check-in:
   - Conta check-ins da lista
   - Compara com regras ativas
   - Libera brindes que atingiram a meta

4. **Interface mostra progresso**:
   - Porcentagem de check-ins
   - Mensagem quando meta é atingida
   - Lista de brindes liberados

5. **Admin marca como entregue** quando o brinde for entregue ao cliente

## 🎯 Exemplos de Regras Sugeridas

- 5 pessoas com check-in feito → ganha 1 drink
- 15 pessoas com check-in feito → ganha 4 cervejas
- 20 pessoas com check-in feito → ganha 1 garrafa de licor Rufus
- 30 pessoas com check-in feito → ganha combo Gin142 e 6 RedBulls

## 📝 Notas Técnicas

- As regras são vinculadas ao `establishment_id`
- Podem ser específicas para um evento (`evento_id`) ou gerais (`evento_id = NULL`)
- A verificação é feita automaticamente após cada check-in
- Brindes liberados são registrados na tabela `guest_list_gifts`
- O sistema previne duplicatas (não libera o mesmo brinde duas vezes)


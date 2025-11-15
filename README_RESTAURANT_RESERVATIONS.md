# Sistema de Reservas do Restaurante - Backend

## Visão Geral

Este sistema implementa um completo gerenciamento de reservas para restaurantes, incluindo:

- ✅ **Reservas do Restaurante**: CRUD completo para reservas
- ✅ **Passantes (Walk-ins)**: Gestão de clientes que chegam sem reserva
- ✅ **Lista de Espera**: Sistema de fila para clientes aguardando mesa
- ✅ **Áreas do Restaurante**: Gestão de diferentes áreas e suas capacidades
- ✅ **Datas Especiais**: Configuração de datas com capacidades especiais ou bloqueios
- ✅ **Relatórios**: Análises e estatísticas completas

## Instalação e Configuração

### 1. Estrutura do Banco de Dados

Execute o script SQL para criar as tabelas necessárias:

```sql
-- Execute o conteúdo do arquivo MySql/u621081794_vamos.sql
-- que contém as tabelas do sistema de reservas
```

### 2. Dados de Exemplo (Opcional)

Para testar o sistema, execute o script de dados de exemplo:

```sql
-- Execute o arquivo scripts/insert_sample_data.sql
```

### 3. Configuração do Servidor

O sistema já está integrado ao `server.js` principal. As rotas estão disponíveis em:

- `/api/restaurant-reservations`
- `/api/walk-ins`
- `/api/waitlist`
- `/api/restaurant-areas`
- `/api/special-dates`
- `/api/reports`

## Estrutura de Arquivos

```
vamos-comemorar-api/
├── routes/
│   ├── restaurantReservations.js  # CRUD de reservas
│   ├── walkIns.js                 # CRUD de passantes
│   ├── waitlist.js                # CRUD de lista de espera
│   ├── restaurantAreas.js         # CRUD de áreas
│   ├── specialDates.js            # CRUD de datas especiais
│   └── reports.js                 # Relatórios e estatísticas
├── scripts/
│   └── insert_sample_data.sql     # Dados de exemplo
├── RESTAURANT_RESERVATIONS_API.md # Documentação completa da API
└── README_RESTAURANT_RESERVATIONS.md # Este arquivo
```

## Funcionalidades Implementadas

### 1. Reservas do Restaurante

**Endpoints:**
- `GET /api/restaurant-reservations` - Listar reservas
- `POST /api/restaurant-reservations` - Criar reserva
- `GET /api/restaurant-reservations/:id` - Buscar reserva específica
- `PUT /api/restaurant-reservations/:id` - Atualizar reserva
- `DELETE /api/restaurant-reservations/:id` - Deletar reserva
- `GET /api/restaurant-reservations/stats/dashboard` - Estatísticas

**Campos:**
- Informações do cliente (nome, telefone, email)
- Data e horário da reserva
- Número de pessoas
- Área e mesa
- Status (NOVA, CONFIRMADA, CANCELADA, CONCLUIDA, NO_SHOW)
- Origem (WIDGET, TELEFONE, PESSOAL, SITE, OUTRO)
- Observações

### 2. Passantes (Walk-ins)

**Endpoints:**
- `GET /api/walk-ins` - Listar passantes
- `POST /api/walk-ins` - Criar passante
- `GET /api/walk-ins/:id` - Buscar passante específico
- `PUT /api/walk-ins/:id` - Atualizar passante
- `DELETE /api/walk-ins/:id` - Deletar passante
- `GET /api/walk-ins/stats/active` - Estatísticas de passantes ativos

**Campos:**
- Informações do cliente (nome, telefone)
- Número de pessoas
- Área e mesa
- Status (ATIVO, FINALIZADO, CANCELADO)
- Observações

### 3. Lista de Espera

**Endpoints:**
- `GET /api/waitlist` - Listar lista de espera
- `POST /api/waitlist` - Adicionar à lista de espera
- `GET /api/waitlist/:id` - Buscar item específico
- `PUT /api/waitlist/:id` - Atualizar item
- `DELETE /api/waitlist/:id` - Remover da lista
- `PUT /api/waitlist/:id/call` - Marcar como chamado
- `GET /api/waitlist/stats/count` - Contagem de itens

**Funcionalidades Especiais:**
- Cálculo automático de posição na fila
- Estimativa de tempo de espera (15 min por pessoa na frente)
- Status de acompanhamento (AGUARDANDO, CHAMADO, ATENDIDO, CANCELADO)

### 4. Áreas do Restaurante

**Endpoints:**
- `GET /api/restaurant-areas` - Listar áreas
- `POST /api/restaurant-areas` - Criar área
- `GET /api/restaurant-areas/:id` - Buscar área específica
- `PUT /api/restaurant-areas/:id` - Atualizar área
- `DELETE /api/restaurant-areas/:id` - Desativar área
- `GET /api/restaurant-areas/:id/availability` - Verificar disponibilidade

**Funcionalidades:**
- Capacidades diferentes para almoço e jantar
- Contagem de reservas e passantes ativos
- Verificação de disponibilidade por data
- Soft delete (desativação) para preservar histórico

### 5. Datas Especiais

**Endpoints:**
- `GET /api/special-dates` - Listar datas especiais
- `POST /api/special-dates` - Criar data especial
- `GET /api/special-dates/:id` - Buscar data específica
- `PUT /api/special-dates/:id` - Atualizar data especial
- `DELETE /api/special-dates/:id` - Deletar data especial
- `GET /api/special-dates/check/:date` - Verificar se data é especial
- `GET /api/special-dates/calendar/:year/:month` - Buscar por mês

**Funcionalidades:**
- Capacidades especiais para datas específicas
- Bloqueio de datas (feriados, manutenção)
- Integração com calendário

### 6. Relatórios

**Endpoints:**
- `GET /api/reports/reservations` - Relatório de reservas
- `GET /api/reports/walk-ins` - Relatório de passantes
- `GET /api/reports/waitlist` - Relatório de lista de espera
- `GET /api/reports/dashboard` - Estatísticas do dashboard

**Tipos de Relatórios:**
- Diário, semanal, mensal, personalizado
- Estatísticas por área, origem, dia da semana
- Análise de ocupação e performance
- Métricas de conversão e retenção

## Exemplos de Uso

### Criar uma Nova Reserva

```bash
curl -X POST https://vamos-comemorar-api.onrender.com/api/restaurant-reservations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
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
    "notes": "Aniversário de casamento",
    "created_by": 1
  }'
```

### Registrar um Passante

```bash
curl -X POST https://vamos-comemorar-api.onrender.com/api/walk-ins \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "client_name": "Maria Santos",
    "client_phone": "(11) 88888-8888",
    "number_of_people": 2,
    "area_id": 1,
    "table_number": "Mesa 3",
    "status": "ATIVO",
    "notes": "Cliente VIP",
    "created_by": 1
  }'
```

### Adicionar à Lista de Espera

```bash
curl -X POST https://vamos-comemorar-api.onrender.com/api/waitlist \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "client_name": "Pedro Costa",
    "client_phone": "(11) 77777-7777",
    "client_email": "pedro@email.com",
    "number_of_people": 3,
    "preferred_time": "20:00:00",
    "status": "AGUARDANDO",
    "notes": "Preferência por mesa na janela"
  }'
```

### Verificar Disponibilidade de uma Área

```bash
curl -X GET "https://vamos-comemorar-api.onrender.com/api/restaurant-areas/1/availability?date=2024-01-15" \
  -H "Authorization: Bearer <token>"
```

### Gerar Relatório de Reservas

```bash
curl -X GET "https://vamos-comemorar-api.onrender.com/api/reports/reservations?type=monthly&start_date=2024-01-01&end_date=2024-01-31" \
  -H "Authorization: Bearer <token>"
```

## Validações e Regras de Negócio

### Reservas
- Nome do cliente é obrigatório
- Data e horário são obrigatórios
- Área deve existir e estar ativa
- Número de pessoas deve ser maior que 0
- Status deve ser um dos valores permitidos

### Passantes
- Nome do cliente é obrigatório
- Área deve existir e estar ativa
- Número de pessoas deve ser maior que 0

### Lista de Espera
- Nome do cliente é obrigatório
- Número de pessoas deve ser maior que 0
- Posição é calculada automaticamente
- Tempo de espera é estimado automaticamente

### Áreas
- Nome deve ser único
- Capacidades devem ser números positivos
- Não é possível deletar área com reservas/passantes ativos

### Datas Especiais
- Nome e data são obrigatórios
- Data deve ser única
- Capacidades devem ser números positivos

## Integração com Frontend

O sistema está totalmente integrado com o frontend `vamos-comemorar-next`:

1. **APIs do Frontend**: Fazem proxy para os endpoints do backend
2. **Componentes**: Modais e páginas prontos para uso
3. **Navegação**: Integrada ao menu administrativo
4. **Dashboard**: Estatísticas em tempo real

## Monitoramento e Logs

- Todos os endpoints logam requisições
- Erros são logados com detalhes
- Estatísticas são calculadas em tempo real
- Health check disponível em `/health`

## Próximos Passos

1. **Autenticação**: Implementar middleware de autenticação
2. **Autorização**: Controle de acesso baseado em roles
3. **Cache**: Implementar cache para consultas frequentes
4. **Notificações**: Sistema de notificações em tempo real
5. **Exportação**: Relatórios em PDF/Excel
6. **API Rate Limiting**: Controle de taxa de requisições
7. **Auditoria**: Logs de auditoria para mudanças
8. **Backup**: Sistema de backup automático

## Suporte

Para dúvidas ou problemas:

1. Verifique os logs do servidor
2. Consulte a documentação da API
3. Teste os endpoints com dados de exemplo
4. Verifique a estrutura do banco de dados

## Changelog

### v1.0.0 (2024-01-XX)
- ✅ Implementação inicial do sistema
- ✅ CRUD completo para todas as entidades
- ✅ Sistema de relatórios
- ✅ Integração com frontend
- ✅ Documentação completa


































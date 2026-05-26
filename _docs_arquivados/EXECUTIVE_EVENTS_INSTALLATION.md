# 🚀 Instalação: Sistema de Executive Event Menus

## ✅ Implementação Completa

Todos os arquivos foram criados e estão prontos para uso.

---

## 📋 Passo 1: Executar Migração SQL

### Opção 1: Via psql (Recomendado)

```bash
# Conectar ao banco PostgreSQL
psql -U seu_usuario -d seu_database -f migrations/create_executive_events_system.sql
```

### Opção 2: Via Script Node.js

```bash
cd vamos-comemorar-api
node -e "
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://usuario:senha@localhost:5432/database'
});

const sql = fs.readFileSync('migrations/create_executive_events_system.sql', 'utf8');
pool.query(sql)
  .then(() => {
    console.log('✅ Migração executada com sucesso!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Erro na migração:', err);
    process.exit(1);
  });
"
```

### Opção 3: Via Render Dashboard

1. Acesse o dashboard do Render
2. Vá em **Shell** do seu serviço PostgreSQL
3. Execute o conteúdo do arquivo `migrations/create_executive_events_system.sql`

---

## 📋 Passo 2: Verificar Backend

### Arquivos Criados:
- ✅ `/routes/executiveEvents.js` - Rotas da API
- ✅ `server.js` - Rota registrada em `/api/executive-events`

### Endpoints Disponíveis:

1. **POST /api/executive-events** (Auth)
   - Criar novo evento
   - Body: `{ establishment_id, name, event_date, logo_url, cover_image_url, category_ids[], subcategory_ids[], custom_colors, welcome_message, wifi_info }`

2. **GET /api/executive-events** (Auth)
   - Listar eventos
   - Query params: `establishment_id?`, `is_active?`

3. **GET /api/executive-events/public/:slug** (Público - SEM Auth)
   - Visualização pública do evento
   - **Retorna itens SEM preços**

4. **GET /api/executive-events/:id** (Auth)
   - Buscar evento por ID

5. **PUT /api/executive-events/:id** (Auth)
   - Atualizar evento

6. **DELETE /api/executive-events/:id** (Auth)
   - Deletar evento

### Testar Backend:

```bash
# Testar criação de evento (requer token JWT)
curl -X POST http://localhost:10000/api/executive-events \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "establishment_id": 1,
    "name": "Jantar Corporativo Q1 2025",
    "event_date": "2025-03-15",
    "category_ids": [1, 2],
    "custom_colors": {
      "backgroundColor": "#f5f5f5",
      "textColor": "#000000"
    }
  }'
```

---

## 📋 Passo 3: Verificar Frontend

### Arquivos Criados:
- ✅ `/app/types/executiveEvents.ts` - Tipos TypeScript
- ✅ `/app/admin/executive-events/page.tsx` - Página Admin
- ✅ `/app/components/ExecutiveEventModal.tsx` - Modal de criação/edição
- ✅ `/app/eventos/[slug]/page.tsx` - Página pública

### Acessar:
- **Admin**: `/admin/executive-events`
- **Público**: `/eventos/[slug]` (ex: `/eventos/jantar-corporativo-q1-2025`)

---

## 🧪 Passo 4: Testar Funcionalidades

### 1. Criar Evento (Admin)
1. Acesse `/admin/executive-events`
2. Clique em "Novo Evento"
3. Preencha:
   - Estabelecimento
   - Nome do evento
   - Data do evento
   - Selecione categorias/subcategorias (opcional)
   - Configure cores (opcional)
   - Adicione mensagem de boas-vindas (opcional)
   - Adicione informações de WiFi (opcional)
4. Clique em "Criar Evento"

### 2. Verificar Automação
- Ao selecionar categorias, o sistema deve buscar automaticamente todos os itens ativos dessas categorias
- Os itens são vinculados ao evento automaticamente

### 3. Visualizar Público
1. Na lista de eventos, clique no ícone de "Abrir em nova aba"
2. Verifique:
   - ✅ **NÃO há preços** exibidos
   - ✅ **NÃO há botões "Add to Cart"**
   - ✅ Cores customizadas são aplicadas
   - ✅ Mensagem de boas-vindas aparece
   - ✅ Informações de WiFi aparecem

### 4. Gerar QR Code
1. Na lista de eventos, clique no ícone de QR Code
2. Uma nova aba abrirá com o QR Code gerado
3. Teste escaneando o QR Code

---

## ⚠️ Pontos de Atenção

### 1. Rota Pública
- A rota pública é `/api/executive-events/public/:slug`
- **NÃO requer autenticação**
- Retorna apenas eventos com `is_active = true`

### 2. Preços
- **CRÍTICO**: A API pública **NÃO retorna** o campo `price`
- O frontend público **NÃO exibe** preços
- O frontend público **NÃO exibe** botões de carrinho

### 3. Automação de Itens
- Ao criar evento com `category_ids`, o backend busca automaticamente todos os itens ativos
- Ao criar evento com `subcategory_ids`, o backend busca automaticamente todos os itens ativos
- Itens devem ter `deleted_at IS NULL` e `visible = true` (ou NULL)

### 4. Slug
- Slug é gerado automaticamente a partir do nome do evento
- Se slug já existe, adiciona `-1`, `-2`, etc.
- Slug é único e usado para acesso público

---

## 🐛 Troubleshooting

### Erro: "Tabela não existe"
- **Solução**: Execute a migração SQL primeiro

### Erro: "Estabelecimento não encontrado"
- **Solução**: Verifique se o `establishment_id` existe na tabela `bars`

### Erro: "Evento não encontrado" na página pública
- **Solução**: Verifique se o evento está com `is_active = true`
- Verifique se o slug está correto

### Itens não aparecem no evento
- **Solução**: 
  - Verifique se as categorias/subcategorias selecionadas têm itens ativos
  - Verifique se os itens têm `deleted_at IS NULL` e `visible = true`

### Cores não são aplicadas
- **Solução**: Verifique se as cores foram salvas em `event_settings.custom_colors`
- Verifique se o formato é hexadecimal (#RRGGBB)

---

## 📊 Estrutura de Dados

### Tabelas Criadas:
1. `executive_events` - Eventos principais
2. `event_settings` - Configurações (JSONB)
3. `event_items` - Relacionamento Event ↔ Items (Many-to-Many)
4. `event_seals` - Selos personalizados por evento

### Relacionamentos:
- `executive_events.establishment_id` → `bars.id`
- `event_items.event_id` → `executive_events.id`
- `event_items.item_id` → `menu_items.id`
- `event_settings.event_id` → `executive_events.id`
- `event_seals.event_id` → `executive_events.id`

---

## ✅ Checklist Final

- [ ] Migração SQL executada
- [ ] Backend rodando sem erros
- [ ] Frontend compilando sem erros
- [ ] Criar evento funciona
- [ ] Automação de categorias funciona
- [ ] Página pública acessível
- [ ] Preços NÃO aparecem na página pública
- [ ] Botões de carrinho NÃO aparecem na página pública
- [ ] Cores customizadas funcionam
- [ ] QR Code gerado corretamente

---

## 🎉 Pronto!

O sistema está completo e pronto para uso em produção.

**Lembre-se**: Teste em staging antes de usar em produção!

---

**Data**: 2025-01-XX  
**Status**: ✅ Implementação Completa


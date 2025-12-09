# 📋 Resumo Executivo: Sistema de Executive Event Menus

## ✅ Análise Completa Realizada

### Estrutura Atual Identificada:

1. **Banco de Dados (PostgreSQL)**:
   - `bars` → Estabelecimentos
   - `menu_categories` → Categorias (1:N com bars)
   - `menu_items` → Itens do cardápio (1:N com categories)
   - Subcategorias são VARCHAR em `menu_items.subCategory` (não é tabela separada)

2. **Backend (Node.js + Express)**:
   - Rotas em `/routes/*.js`
   - Padrão: `module.exports = (pool) => { ... }`
   - Registro em `server.js`

3. **Frontend (Next.js 14+)**:
   - App Router
   - Tipos em `/app/types/`
   - Admin em `/app/admin/*`

---

## 🗄️ Schema Proposto (4 Novas Tabelas)

### 1. `executive_events`
- Campos principais: `name`, `event_date`, `logo_url`, `cover_image_url`, `slug`, `is_active`
- FK: `establishment_id` → `bars.id`
- **Slug único** para acesso público sem autenticação

### 2. `event_settings` (JSONB)
- `custom_colors` → Cores personalizadas (categorias, subcategorias, sidebar, background)
- `welcome_message` → Mensagem de boas-vindas
- `wifi_info` → Informações de WiFi (network, password)

### 3. `event_items` (Many-to-Many)
- Relaciona `executive_events` ↔ `menu_items`
- Campo `display_order` para ordenação customizada
- **AUTOMAÇÃO**: Ao criar evento com `category_ids` ou `subcategory_ids`, o backend busca automaticamente todos os itens ativos e vincula

### 4. `event_seals`
- Selos/badges personalizados por evento
- Campos: `name`, `color`, `type`, `display_order`

---

## 🔧 Endpoints Backend Propostos

### `POST /api/executive-events`
**Criar Evento**
- Input: `establishment_id`, `name`, `event_date`, `logo_url`, `cover_image_url`, `category_ids[]`, `subcategory_ids[]`, `custom_colors`, `welcome_message`, `wifi_info`
- **AUTOMAÇÃO**: Se `category_ids` ou `subcategory_ids` fornecidos, busca automaticamente todos os itens ativos e vincula ao evento
- Retorna: Evento completo criado

### `GET /api/executive-events`
**Listar Eventos** (Admin)
- Query params: `establishment_id?`, `is_active?`
- Retorna: Lista de eventos com informações básicas

### `GET /api/executive-events/:slug`
**Visualização Pública** (SEM AUTENTICAÇÃO)
- Retorna: Evento completo com itens do cardápio
- **CRÍTICO**: Itens retornados **SEM campo `price`**
- Retorna: Categorias agrupadas, selos, settings

### `PUT /api/executive-events/:id`
**Atualizar Evento** (Admin)

### `DELETE /api/executive-events/:id`
**Deletar Evento** (Admin)

---

## 🎨 Frontend Admin

### Página: `/app/admin/executive-events/page.tsx`
- Lista de eventos
- Botão "Criar Evento"
- Botão "Gerar QR Code" (por evento)
- Link para visualização pública

### Modal: `ExecutiveEventModal`
- **Upload de Imagens**: Logo e Cover
- **Color Pickers**: Para cada cor customizável
- **Dropdown Estabelecimento**: → Triggers fetch de categorias
- **Multi-select Categorias/Subcategorias**: Para auto-popular menu
- **Campo Mensagem de Boas-Vindas**: Textarea
- **Campos WiFi**: Network e Password

---

## 🌐 Frontend Público

### Página: `/app/eventos/[slug]/page.tsx`

**REGRAS CRÍTICAS**:
1. ❌ **NÃO exibir preços** (campo `price` não existe na resposta da API)
2. ❌ **NÃO exibir botões "Add to Cart"**
3. ✅ Aplicar cores customizadas de `event_settings.custom_colors`
4. ✅ Exibir mensagem de boas-vindas
5. ✅ Exibir informações de WiFi
6. ✅ Renderizar menu agrupado por categorias
7. ✅ Exibir selos/badges personalizados

**Acesso**: Direto via URL `/eventos/[slug]` ou QR Code (sem login)

---

## 🎁 3 Features Bônus Sugeridas

### 1. **Filtros de Alergênicos/Dietas**
- Adicionar campo `allergens` (JSONB) em `menu_items` (se não existir)
- Adicionar `dietary_filters` em `event_settings`
- Frontend: Checkboxes para filtrar (gluten-free, vegan, etc.)
- **Valor**: Acessibilidade e segurança alimentar

### 2. **Mensagem de Boas-Vindas Rica**
- Campo `welcome_message` já incluído
- Adicionar suporte a Markdown/HTML simples
- Adicionar campo `host_company_name` em `executive_events`
- **Valor**: Personalização e reforço de marca

### 3. **WiFi e Contato Rápido**
- Campo `wifi_info` já incluído
- Adicionar `contact_info` (JSONB) com WhatsApp/Telefone/Email
- Frontend: Botões flutuantes de contato
- Botão "Copiar Senha WiFi"
- **Valor**: Melhora experiência e reduz fricção

---

## 📝 Arquivos Criados

1. ✅ `EXECUTIVE_EVENTS_IMPLEMENTATION_PLAN.md` → Plano completo detalhado
2. ✅ `migrations/create_executive_events_system.sql` → Migração SQL pronta para executar

---

## 🚀 Próximos Passos

### 1. Executar Migração
```bash
# No banco PostgreSQL
psql -U usuario -d database < migrations/create_executive_events_system.sql
```

### 2. Implementar Backend
- Criar `/routes/executiveEvents.js`
- Registrar em `server.js`
- Testar endpoints

### 3. Implementar Frontend Admin
- Criar página `/app/admin/executive-events/page.tsx`
- Criar componente `ExecutiveEventModal`
- Implementar upload de imagens
- Implementar color pickers

### 4. Implementar Frontend Público
- Criar página `/app/eventos/[slug]/page.tsx`
- Garantir que preços NÃO sejam exibidos
- Garantir que botões de carrinho NÃO sejam exibidos
- Aplicar cores customizadas

### 5. Implementar Features Bônus (Opcional)
- Filtros de alergênicos
- Mensagem de boas-vindas rica
- WiFi/Contato rápido

---

## ⚠️ Pontos de Atenção

1. **Backward Compatibility**: ✅ Todas as mudanças são aditivas (novas tabelas apenas)
2. **Segurança**: Endpoint público não requer auth, mas valida `is_active`
3. **Performance**: Índices criados em todas as FKs e campos de busca
4. **AUTOMAÇÃO**: Backend busca automaticamente itens ao selecionar categorias/subcategorias
5. **SEM PREÇOS**: API pública não retorna `price`, frontend não exibe

---

## 📊 Estrutura de Dados JSONB

### `event_settings.custom_colors`
```json
{
  "categoryBgColor": "#1a1a1a",
  "categoryTextColor": "#ffffff",
  "subcategoryBgColor": "#2a2a2a",
  "subcategoryTextColor": "#f0f0f0",
  "sidebarBgColor": "#333333",
  "sidebarTextColor": "#ffffff",
  "backgroundColor": "#f5f5f5",
  "textColor": "#000000"
}
```

### `event_settings.wifi_info`
```json
{
  "network": "Restaurante_WiFi",
  "password": "Evento2025"
}
```

---

**Status**: ✅ Análise Completa | ✅ Schema Proposto | ✅ Plano de Implementação | ✅ Pronto para Desenvolvimento


# 🚀 Instalação: Sistema de Permissões por Estabelecimento

## ✅ Implementação Completa

Todas as melhorias foram implementadas e estão prontas para uso.

---

## 📋 Passo 1: Executar Migração SQL

### Opção 1: Via Script Node.js (Recomendado)

```bash
cd vamos-comemorar-api
node scripts/run_establishment_permissions_migration.js
```

### Opção 2: Via psql (PostgreSQL)

```bash
# Conectar ao banco PostgreSQL
psql -U seu_usuario -d seu_database -f migrations/create_establishment_permissions_system_postgresql.sql
```

### Opção 3: Via Render Dashboard

1. Acesse o dashboard do Render
2. Vá em **Shell** do seu serviço PostgreSQL
3. Execute o conteúdo do arquivo `migrations/create_establishment_permissions_system_postgresql.sql`

---

## 📋 Passo 2: Verificar Backend

### Arquivos Criados:
- ✅ `/routes/establishmentPermissions.js` - Rotas da API
- ✅ `/middleware/checkEstablishmentPermission.js` - Middleware de validação
- ✅ `server.js` - Rota registrada em `/api/establishment-permissions`

### Endpoints Disponíveis:

1. **GET /api/establishment-permissions** (Auth - Admin)
   - Listar todas as permissões
   - Query params: `user_id?`, `establishment_id?`, `user_email?`, `is_active?`

2. **GET /api/establishment-permissions/my-permissions** (Auth)
   - Buscar permissões do usuário logado

3. **GET /api/establishment-permissions/:id** (Auth - Admin)
   - Buscar uma permissão específica

4. **POST /api/establishment-permissions** (Auth - Admin)
   - Criar nova permissão
   - Body: `{ user_id, user_email, establishment_id, can_edit_os, ... }`

5. **PUT /api/establishment-permissions/:id** (Auth - Admin)
   - Atualizar permissão

6. **DELETE /api/establishment-permissions/:id** (Auth - Admin)
   - Remover permissão (soft delete)

7. **GET /api/establishment-permissions/audit-logs** (Auth - Admin)
   - Listar logs de auditoria
   - Query params: `user_id?`, `target_user_id?`, `establishment_id?`, `action_type?`, `limit?`

---

## 📋 Passo 3: Verificar Frontend

### Arquivos Atualizados:
- ✅ `/app/hooks/useEstablishmentPermissions.ts` - Agora busca do banco de dados
- ✅ `/app/admin/permissions/page.tsx` - Página administrativa para gerenciar permissões

### Página Administrativa:
- Acesse `/admin/permissions` para gerenciar permissões
- Interface completa com:
  - Listagem de permissões
  - Filtros (busca, estabelecimento, status)
  - Criação e edição de permissões
  - Visualização de logs de auditoria

---

## 📋 Passo 4: Usar Middleware de Validação

### Exemplo de Uso:

```javascript
const checkEstablishmentPermission = require('../middleware/checkEstablishmentPermission');

// Verificar permissão específica
router.put('/operational-details/:id', 
  auth, 
  checkEstablishmentPermission('can_edit_operational_detail', 'body'),
  async (req, res) => {
    // Handler
  }
);

// Verificar apenas acesso ao estabelecimento
router.get('/operational-details',
  auth,
  checkEstablishmentPermission.checkEstablishmentAccess,
  async (req, res) => {
    // Handler
  }
);
```

---

## 🔒 Segurança

### Validações Implementadas:

1. **Frontend**: Hook `useEstablishmentPermissions` busca permissões do backend
2. **Backend**: Middleware `checkEstablishmentPermission` valida permissões
3. **Logs**: Todas as alterações são registradas em `permission_audit_logs`

### Recomendações:

- Sempre use o middleware no backend para validação adicional
- Monitore os logs de auditoria regularmente
- Revise permissões periodicamente

---

## 📊 Estrutura do Banco de Dados

### Tabelas Criadas:

1. **user_establishment_permissions**
   - Armazena permissões de usuários por estabelecimento
   - Campos de permissão: `can_edit_os`, `can_edit_operational_detail`, etc.

2. **permission_audit_logs**
   - Logs de auditoria de todas as alterações
   - Campos: `action_type`, `permission_changes`, `user_id`, etc.

3. **role_permission_templates**
   - Templates de permissões padrão por role
   - Permite criar permissões baseadas em roles

---

## 🎯 Funcionalidades Implementadas

### ✅ Melhorias Completas:

1. ✅ **Permissões no Banco de Dados**
   - Migração SQL criada
   - Dados migrados automaticamente
   - Suporte a múltiplos estabelecimentos

2. ✅ **Interface Administrativa**
   - Página completa em `/admin/permissions`
   - CRUD completo de permissões
   - Filtros e busca

3. ✅ **Validação no Backend**
   - Middleware de validação criado
   - Pode ser usado em qualquer rota
   - Validação por estabelecimento

4. ✅ **Logs de Auditoria**
   - Tabela de logs criada
   - Registro automático de alterações
   - Interface para visualizar logs

5. ✅ **Suporte a Múltiplos Estabelecimentos**
   - Um usuário pode ter permissões diferentes para cada estabelecimento
   - Hook atualizado para suportar múltiplos estabelecimentos

6. ✅ **API Endpoints**
   - CRUD completo via API
   - Endpoint para buscar permissões do usuário logado
   - Endpoint para logs de auditoria

---

## 🚀 Próximos Passos

1. Executar a migração SQL
2. Testar a página `/admin/permissions`
3. Adicionar middleware de validação nas rotas que precisam
4. Monitorar logs de auditoria

---

## 📝 Notas

- As permissões antigas (hardcoded) continuam funcionando como fallback
- O sistema busca primeiro do banco, se não encontrar, permite acesso total (admin)
- Logs de auditoria são criados automaticamente em todas as alterações


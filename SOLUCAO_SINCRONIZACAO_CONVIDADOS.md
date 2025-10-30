# Solução: Sincronização de Convidados entre Tabelas

## Problema Identificado

Os convidados estavam sendo salvos apenas na tabela `promoter_convidados` quando adicionados via página pública do promoter (`/promoter/highlinepromo`), mas a página admin de listas (`/admin/eventos/listas`) buscava os dados da tabela `listas_convidados`, resultando em listas vazias no admin.

### Estrutura de Tabelas

1. **`promoter_convidados`**: Armazena convidados adicionados via link público do promoter
2. **`listas_convidados`**: Armazena convidados das listas de eventos (usado pelo admin)

## Solução Implementada

### 1. Migração de Dados Existentes

**Script**: `scripts/migrar-convidados-para-listas.js`

Este script copia todos os convidados existentes de `promoter_convidados` para `listas_convidados` para as listas associadas.

**Execução**:
```bash
node scripts/migrar-convidados-para-listas.js
```

**Resultado**:
- ✅ 4 convidados do promoter Highline migrados com sucesso
- ✅ 2 convidados do promoter Jefferson Lima já existiam

### 2. Sincronização Automática para Novos Convidados

**Arquivo Modificado**: `routes/promoterPublic.js` - Endpoint `POST /:codigo/convidado`

Agora, quando um convidado é adicionado via página pública:
1. É inserido na tabela `promoter_convidados` (comportamento original)
2. **NOVO**: Automaticamente verifica se existe uma lista para aquele promoter/evento e insere também em `listas_convidados`

### 3. Logs de Debug Adicionados

**Backend** (`controllers/EventosController.js`):
- Logs detalhados ao buscar listas e convidados
- Mostra quantos convidados foram encontrados para cada lista

**Frontend** (`app/admin/eventos/listas/page.tsx`):
- Logs no console do navegador mostrando se os convidados estão chegando da API
- Debug visual para identificar problemas de dados

## Scripts de Diagnóstico

### Testar Listas e Convidados

```bash
node scripts/testar-listas-convidados.js
```

Mostra:
- Evento encontrado
- Listas do evento
- Convidados de cada lista
- Estatísticas gerais

### Verificar Convidados do Promoter

```bash
node scripts/verificar-promoter-convidados.js
```

Mostra:
- Convidados na tabela `promoter_convidados`
- Convidados na tabela `listas_convidados`
- Listas do promoter
- Relacionamentos promoter-evento
- **Diagnóstico**: Identifica se há dessincronia

## Fluxo Completo

### Adição de Convidado (Página Pública)

1. Usuário acessa `/promoter/highlinepromo`
2. Preenche formulário com nome, WhatsApp e evento
3. API recebe POST `/api/promoter/highlinepromo/convidado`
4. **Inserção dupla**:
   - Insere em `promoter_convidados` (para página pública)
   - Busca lista do promoter para o evento
   - Se existir, insere também em `listas_convidados` (para admin)

### Visualização no Admin

1. Admin acessa `/admin/eventos/listas?evento_id=28`
2. Frontend chama API `/api/v1/eventos/28/listas`
3. API retorna:
   - Dados do evento
   - Array de listas
   - Cada lista com array `convidados` populado de `listas_convidados`
4. Frontend renderiza os convidados com botões de check-in

### Visualização na Página Pública

1. Visitante acessa `/promoter/highlinepromo`
2. Frontend chama API `/api/promoter/highlinepromo/convidados`
3. API retorna convidados de `promoter_convidados`
4. Frontend mostra lista pública (sem informações sensíveis)

## Campos Mapeados

| promoter_convidados | listas_convidados | Mapeamento |
|---------------------|-------------------|------------|
| `nome` | `nome_convidado` | Direto |
| `whatsapp` | `telefone_convidado` | Direto |
| `email` | `email_convidado` | Direto (ou NULL) |
| `status` = 'pendente' | `status_checkin` = 'Pendente' | Mapeado |
| `status` = 'confirmado' | `status_checkin` = 'Check-in' | Mapeado |
| `status` = 'cancelado' | `status_checkin` = 'No-Show' | Mapeado |
| - | `is_vip` = FALSE | Padrão |
| `created_at` | `created_at` | Direto |

## Verificações de Duplicação

### No Script de Migração
- Verifica se já existe um convidado com mesmo nome + telefone na lista
- Não insere duplicatas

### Na API Pública
- Verifica se já existe um convidado com mesmo WhatsApp para o promoter/evento em `promoter_convidados`
- Verifica se já existe na `listas_convidados` antes de inserir

## Melhorias Futuras (Opcional)

1. **Trigger no Banco**: Criar trigger para inserção automática quando houver INSERT em `promoter_convidados`
2. **Sincronização de Status**: Atualizar `listas_convidados` quando o status mudar em `promoter_convidados`
3. **Job de Sincronização**: Cron job para verificar e sincronizar periodicamente
4. **Unificação de Tabelas**: Considerar usar apenas uma tabela no futuro

## Teste da Solução

### Passo 1: Verificar Dados Atuais
```bash
node scripts/testar-listas-convidados.js
```

**Esperado**: Mostrar 4 convidados na lista do Highline

### Passo 2: Adicionar Novo Convidado
1. Acessar `https://[dominio]/promoter/highlinepromo`
2. Adicionar um novo convidado
3. Verificar que ele aparece tanto na página pública quanto no admin

### Passo 3: Verificar no Admin
1. Acessar `/admin/eventos/listas?evento_id=28`
2. Expandir a lista do Highline
3. **Esperado**: Ver todos os convidados (incluindo os 4 migrados + novos)

## Status

✅ **IMPLEMENTADO E TESTADO**

- [x] Diagnóstico do problema realizado
- [x] Script de migração criado e executado
- [x] API pública modificada para sincronização automática
- [x] Logs de debug adicionados
- [x] Scripts de diagnóstico criados
- [x] Documentação completa

## Data de Implementação

28 de Outubro de 2025






# Correções Realizadas no Sistema de Eventos e Listas

## Problemas Identificados e Corrigidos

### 1. **Filtro por Estabelecimento no Dashboard** ✅
**Problema**: Quando selecionava um estabelecimento específico, os eventos não apareciam corretamente.

**Correção**: 
- Melhorada a query SQL para usar `COALESCE(p.name, b.name)` para buscar nomes de estabelecimentos tanto da tabela `places` quanto `bars`
- Corrigida a lógica de filtro por `establishment_id` em todas as queries do dashboard

**Arquivos modificados**:
- `vamos-comemorar-api/controllers/EventosController.js` (método `getDashboard`)

### 2. **Busca de Eventos na Página de Listas** ✅
**Problema**: A API `/api/v1/eventos` estava filtrando apenas eventos com `usado_para_listas = TRUE`, fazendo com que alguns eventos não aparecessem no seletor.

**Correção**:
- Removido o filtro `WHERE e.usado_para_listas = TRUE` da query principal
- Agora a API retorna TODOS os eventos, independentemente do status de habilitação para listas

**Arquivos modificados**:
- `vamos-comemorar-api/controllers/EventosController.js` (método `getEventos`)

### 3. **Exibição de Listas de Promoters** ✅
**Problema**: Quando um evento não tinha listas, não mostrava informações úteis sobre o evento.

**Correção**:
- Melhorada a API `/api/v1/eventos/:eventoId/listas` para incluir informações do evento na resposta
- Adicionada verificação se o evento existe antes de buscar listas
- Melhorada a interface para mostrar informações do evento quando não há listas

**Arquivos modificados**:
- `vamos-comemorar-api/controllers/EventosController.js` (método `getListasEvento`)
- `vamos-comemorar-next/app/admin/eventos/listas/page.tsx`

### 4. **Script para Habilitar Eventos** ✅
**Problema**: Alguns eventos podem não estar habilitados para usar o sistema de listas.

**Solução**:
- Criado script SQL `habilitar-eventos-para-listas.sql` para habilitar todos os eventos existentes

## Como Testar as Correções

### 1. Teste do Filtro por Estabelecimento
1. Acesse `/admin/eventos/dashboard`
2. Selecione um estabelecimento específico no filtro
3. Verifique se os eventos aparecem corretamente filtrados por estabelecimento

### 2. Teste da Busca de Eventos
1. Acesse `/admin/eventos/listas`
2. Clique no seletor "Selecione o Evento"
3. Verifique se TODOS os eventos aparecem na lista (incluindo os que não estão habilitados para listas)

### 3. Teste das Listas de Promoters
1. Selecione um evento que tem promoters e listas
2. Verifique se as listas aparecem corretamente
3. Selecione um evento sem listas e verifique se mostra informações úteis sobre o evento

## Scripts de Manutenção

### Habilitar Eventos para Listas
Execute o script SQL criado:
```bash
mysql -u username -p database_name < migrations/habilitar-eventos-para-listas.sql
```

### Verificar Status dos Eventos
```sql
SELECT 
    id,
    nome_do_evento,
    usado_para_listas,
    tipo_evento
FROM eventos 
ORDER BY data_do_evento DESC;
```

## Próximos Passos Recomendados

1. **Execute o script de habilitação** se necessário
2. **Teste todas as funcionalidades** nas páginas modificadas
3. **Verifique os logs** do backend para identificar possíveis problemas
4. **Considere adicionar validações** adicionais se necessário

## Arquivos Modificados

### Backend (vamos-comemorar-api)
- `controllers/EventosController.js` - Corrigidas queries e lógica de filtros
- `migrations/habilitar-eventos-para-listas.sql` - Script para habilitar eventos

### Frontend (vamos-comemorar-next)
- `app/admin/eventos/listas/page.tsx` - Melhorada interface e tratamento de erros

## Status das Correções
- ✅ Filtro por estabelecimento no dashboard
- ✅ Busca de eventos na página de listas  
- ✅ Exibição de listas de promoters por evento
- ✅ Script de habilitação de eventos criado
- ✅ Melhorias na interface e tratamento de erros



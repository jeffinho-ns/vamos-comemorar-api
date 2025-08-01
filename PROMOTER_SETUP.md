# Configuração do Sistema de Promoters

Este documento explica como configurar o sistema de promoters no backend da API.

## 🚀 Migração do Banco de Dados

### 1. Execute a migração do banco de dados:

```bash
cd vamos-comemorar-api
node run_migration.js
```

### 2. Verifique se a migração foi executada com sucesso:

```sql
-- Verificar se as colunas foram criadas
DESCRIBE eventos;

-- Verificar se os índices foram criados
SHOW INDEX FROM eventos;
```

## 📋 Novos Endpoints Adicionados

### 1. Buscar eventos do promoter
```
GET /api/events/promoter
Authorization: Bearer <token>
```

**Resposta:**
```json
[
  {
    "id": 1,
    "nome_do_evento": "Festa de Aniversário",
    "casa_do_evento": "High Line",
    "data_do_evento": "2024-01-15",
    "hora_do_evento": "20:00",
    "imagem_do_evento_url": "https://...",
    "criado_por": 123,
    "promoter_id": 123
  }
]
```

### 2. Verificar se usuário é promoter de um evento
```
GET /api/events/:id/promoter-check
Authorization: Bearer <token>
```

**Resposta:**
```json
{
  "isPromoter": true
}
```

## 🔧 Estrutura do Banco de Dados

### Novas colunas na tabela `eventos`:

- `criado_por` (INT): ID do usuário que criou o evento
- `promoter_id` (INT): ID do usuário que é o promoter principal do evento

### Índices criados:
- `idx_eventos_promoter`: Para consultas por promoter_id
- `idx_eventos_criado_por`: Para consultas por criado_por

## 🎯 Lógica de Promoters

Um usuário é considerado promoter de um evento se:

1. **É o criador do evento** (`criado_por = user_id`)
2. **É o promoter designado** (`promoter_id = user_id`)
3. **Tem reservas associadas ao evento** (relacionamento via tabela `reservas`)

## 📱 Integração com o App Flutter

O app Flutter já está configurado para usar estes endpoints:

- `EventService.fetchPromoterEvents()` - Busca eventos do promoter
- `EventService.isUserPromoterOfEvent()` - Verifica permissões

## 🔍 Testando os Endpoints

### 1. Teste de busca de eventos do promoter:
```bash
curl -X GET \
  https://vamos-comemorar-api.onrender.com/api/events/promoter \
  -H 'Authorization: Bearer <seu_token>'
```

### 2. Teste de verificação de promoter:
```bash
curl -X GET \
  https://vamos-comemorar-api.onrender.com/api/events/1/promoter-check \
  -H 'Authorization: Bearer <seu_token>'
```

## ⚠️ Importante

- A migração é segura e pode ser executada múltiplas vezes
- Colunas duplicadas são ignoradas automaticamente
- Eventos existentes não terão `criado_por` definido até serem editados
- O sistema funciona mesmo sem as novas colunas (fallback para reservas)

## 🆘 Solução de Problemas

### Erro: "Column already exists"
- Normal, a migração ignora colunas que já existem

### Erro: "Foreign key constraint fails"
- Verifique se a tabela `users` existe e tem dados

### Endpoints retornam erro 500
- Verifique os logs do servidor
- Confirme se a migração foi executada com sucesso

## 📞 Suporte

Se encontrar problemas, verifique:
1. Logs do servidor Node.js
2. Logs do banco de dados MySQL
3. Status da conexão com o banco 
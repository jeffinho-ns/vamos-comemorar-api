# Sistema de Selos para Cardápio

Este documento descreve a implementação do sistema de selos para itens do cardápio.

## 📋 Visão Geral

O sistema de selos permite marcar itens do cardápio com identificadores visuais coloridos que ajudam os clientes a identificar características especiais dos produtos.

### Selos de Comida
- 🟠 **Especial do Dia** - Laranja
- 🟢 **Vegetariano** - Verde
- 🟢 **Saudável/Leve** - Verde claro
- 🟠 **Prato da Casa** - Laranja escuro
- 🟤 **Artesanal** - Marrom

### Selos de Bebida
- 🟣 **Assinatura do Bartender** - Roxo
- 🔴 **Edição Limitada** - Rosa
- 🟣 **Processo Artesanal** - Roxo escuro
- 🔵 **Sem Álcool** - Azul claro
- 🔵 **Refrescante** - Azul claro
- 🟡 **Cítrico** - Amarelo
- 🟡 **Doce** - Amarelo escuro
- 🔴 **Picante** - Vermelho

## 🗄️ Estrutura do Banco de Dados

### Migração Necessária

Antes de usar o sistema, execute a migração para adicionar o campo `seals` na tabela `menu_items`:

```bash
# Navegar para o diretório da API
cd vamos-comemorar-api

# Executar migração
node scripts/run_migration_seals.js
```

### Estrutura da Tabela

A tabela `menu_items` agora inclui:
- `seals` (JSON): Array de IDs dos selos selecionados para o item

## 🔧 Configuração

### Variáveis de Ambiente

Certifique-se de que as seguintes variáveis estão configuradas:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=sua_senha
DB_NAME=u621081794_vamos
```

## 🚀 Como Usar

### 1. Executar Migração

```bash
node scripts/run_migration_seals.js
```

### 2. Testar Integração

```bash
node scripts/test_seals_integration.js
```

### 3. Usar no Frontend

O sistema já está integrado no frontend (`vamos-comemorar-next`). Os selos aparecerão:

- **No Admin**: Seção de selos no modal de edição de item
- **Para Clientes**: Badges coloridos nos itens do cardápio

## 📡 API Endpoints

### Criar Item com Selos

```http
POST /api/cardapio/items
Content-Type: application/json

{
  "name": "Pizza Margherita",
  "description": "Pizza artesanal com molho de tomate",
  "price": 45.90,
  "imageUrl": "pizza.jpg",
  "categoryId": 1,
  "barId": 1,
  "subCategory": "Pizzas",
  "order": 1,
  "seals": ["artesanal", "vegetariano", "prato-da-casa"],
  "toppings": []
}
```

### Atualizar Item com Selos

```http
PUT /api/cardapio/items/:id
Content-Type: application/json

{
  "name": "Pizza Margherita",
  "description": "Pizza artesanal com molho de tomate",
  "price": 45.90,
  "imageUrl": "pizza.jpg",
  "categoryId": 1,
  "barId": 1,
  "subCategory": "Pizzas",
  "order": 1,
  "seals": ["artesanal", "vegetariano"],
  "toppings": []
}
```

### Listar Itens (com Selos)

```http
GET /api/cardapio/items
```

Resposta:
```json
[
  {
    "id": 1,
    "name": "Pizza Margherita",
    "description": "Pizza artesanal com molho de tomate",
    "price": 45.90,
    "imageUrl": "pizza.jpg",
    "categoryId": 1,
    "barId": 1,
    "subCategory": "Pizzas",
    "order": 1,
    "seals": ["artesanal", "vegetariano"],
    "toppings": []
  }
]
```

## 🎨 Exibição Visual

### No Admin
- Checkboxes com cores para seleção
- Preview em tempo real dos selos selecionados
- Organização por tipo (Comida/Bebida)

### Para Clientes
- Badges coloridos abaixo da descrição do item
- Cores distintas para fácil identificação
- Layout responsivo

## 🔍 Troubleshooting

### Problema: Selos não aparecem
1. Verifique se a migração foi executada
2. Confirme se o campo `seals` existe na tabela `menu_items`
3. Verifique os logs da API para erros de parsing JSON

### Problema: Erro ao salvar selos
1. Verifique se os IDs dos selos são válidos
2. Confirme se o array `seals` está sendo enviado corretamente
3. Verifique a conexão com o banco de dados

### Problema: Cores não aparecem
1. Verifique se o CSS está carregando corretamente
2. Confirme se as cores estão definidas nas constantes
3. Verifique se o JavaScript está executando sem erros

## 📝 Logs

Para debugar problemas, verifique os logs da API:

```bash
# Logs da aplicação
tail -f logs/app.log

# Logs do banco de dados
tail -f logs/mysql.log
```

## 🧪 Testes

Execute os testes de integração:

```bash
# Teste completo
node scripts/test_seals_integration.js

# Teste específico de banco
node -e "
const mysql = require('mysql2/promise');
const dbConfig = { host: 'localhost', user: 'root', password: '', database: 'u621081794_vamos' };
mysql.createConnection(dbConfig).then(conn => {
  return conn.execute('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = \"menu_items\" AND COLUMN_NAME = \"seals\"');
}).then(([rows]) => {
  console.log('Campo seals existe:', rows.length > 0);
  process.exit(0);
}).catch(console.error);
"
```

## 📚 Documentação Adicional

- [Estrutura do Banco de Dados](migrations/)
- [API Endpoints](routes/cardapio.js)
- [Frontend Integration](../vamos-comemorar-next/app/admin/cardapio/page.tsx)

























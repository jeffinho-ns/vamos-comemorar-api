# ⚠️ URGENTE: Executar Migração SQL para Sistema de Brindes

## 🚨 Erro 500 - Tabelas Não Encontradas

O erro **500 (Internal Server Error)** está ocorrendo porque as tabelas `gift_rules` e `guest_list_gifts` **ainda não foram criadas** no banco de dados.

## ✅ Solução Imediata

### Passo 1: Executar a Migração PostgreSQL

Execute esta migração SQL no banco de dados PostgreSQL de produção:

**Arquivo:** `migrations/create_gift_rules_system_postgresql.sql`

### Como Executar

**Opção 1: Via Render Dashboard (Recomendado)**
1. Acesse: https://dashboard.render.com
2. Vá em **Databases** → Seu banco PostgreSQL
3. Clique em **Connect** → **Query Editor** (ou **Shell**)
4. Cole e execute o conteúdo do arquivo `create_gift_rules_system_postgresql.sql`

**Opção 2: Via psql (linha de comando)**
```bash
# Conectar ao banco
psql "postgresql://USER:PASSWORD@HOST/agilizaidb?sslmode=prefer"

# Depois executar o conteúdo do arquivo SQL
\i migrations/create_gift_rules_system_postgresql.sql
```

**Opção 3: Via script Node.js (temporário)**
Crie um script temporário para executar a migração:

```javascript
// scripts/run_gift_rules_migration.js
const pool = require('../config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, '../migrations/create_gift_rules_system_postgresql.sql'),
      'utf8'
    );
    
    await pool.query(migrationSQL);
    console.log('✅ Migração executada com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao executar migração:', error);
    process.exit(1);
  }
}

runMigration();
```

Depois execute:
```bash
node scripts/run_gift_rules_migration.js
```

### Passo 2: Verificar se as Tabelas Foram Criadas

Execute no banco:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'meu_backup_db' -- ou 'public' dependendo do schema
AND table_name IN ('gift_rules', 'guest_list_gifts');
```

Deve retornar 2 linhas (gift_rules e guest_list_gifts).

### Passo 3: Testar Novamente

Após executar a migração:
1. Aguarde 1-2 minutos
2. Recarregue a página `/admin/restaurant-reservations` → Configurações
3. Tente criar uma regra de brinde novamente
4. O erro 500 não deve mais aparecer

---

## 📋 Conteúdo da Migração

A migração cria duas tabelas:

1. **gift_rules** - Armazena as regras de brindes configuráveis
2. **guest_list_gifts** - Armazena os brindes liberados para cada lista

---

## 🔍 Verificação Rápida

Para verificar se o problema é realmente as tabelas não existentes, você pode executar:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'gift_rules';
```

Se retornar 0 linhas, as tabelas não existem e você precisa executar a migração.

---

## ✅ Após Executar a Migração

O sistema deve funcionar normalmente:
- ✅ Listar regras de brindes
- ✅ Criar novas regras
- ✅ Editar regras
- ✅ Deletar regras
- ✅ Brindes serão liberados automaticamente após check-ins


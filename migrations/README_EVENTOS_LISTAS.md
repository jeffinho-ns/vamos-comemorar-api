# 📁 MIGRATIONS - MÓDULO DE EVENTOS E LISTAS

---

## 📋 ARQUIVOS NESTA PASTA

### ✅ USE ESTES (Versão 2.0 - Integrada)

```
eventos-listas-module-v2.sql              → Script principal (OBRIGATÓRIO)
habilitar-eventos-existentes.sql          → Habilita eventos (RECOMENDADO)
teste-rapido.sql                          → Validação (IMPORTANTE)
rollback-eventos-listas-v1.sql            → Rollback da V1 (se aplicável)
executar-migracao.sh                      → Script automático (FÁCIL)
```

### ⚠️ IGNORE ESTE (Versão 1.0 - Obsoleta)

```
eventos-listas-module.sql                 → NÃO USAR (versão antiga)
```

---

## 🚀 EXECUÇÃO RÁPIDA

### Opção 1: Script Automático (Recomendado)

```bash
cd /Users/preto/Documents/GitHub/vamos-comemorar-api/migrations
./executar-migracao.sh
```

O script irá:
1. Pedir a senha do banco
2. Perguntar se precisa de rollback
3. Executar scripts na ordem correta
4. Validar instalação
5. Mostrar resultado

---

### Opção 2: Manual

```bash
# 1. Conectar ao MySQL
mysql -h 193.203.175.55 -u u621081794_vamos -p

# 2. No prompt MySQL, executar:
USE u621081794_vamos;

# 3a. Se já executou V1, fazer rollback:
SOURCE /caminho/completo/rollback-eventos-listas-v1.sql;

# 3b. Executar V2 (principal):
SOURCE /caminho/completo/eventos-listas-module-v2.sql;

# 3c. Habilitar eventos:
SOURCE /caminho/completo/habilitar-eventos-existentes.sql;

# 4. Validar:
SOURCE /caminho/completo/teste-rapido.sql;
```

---

## 📊 O QUE CADA SCRIPT FAZ

### eventos-listas-module-v2.sql
**O que faz:**
- Adiciona campos à tabela `eventos` existente
- Cria 6 novas tabelas (promoters, listas, beneficios, etc.)
- Insere dados de exemplo
- Configura foreign keys

**Tabelas criadas:**
1. `promoters` - Gerenciamento de promoters
2. `listas` - Listas de convidados
3. `listas_convidados` - Convidados com check-in
4. `beneficios` - Benefícios dos convidados
5. `lista_convidado_beneficio` - Relacionamento
6. `hostess` - Equipe de atendimento

**Campos adicionados em `eventos`:**
- `usado_para_listas` (boolean)
- `promoter_criador_id` (int, FK para promoters)

---

### habilitar-eventos-existentes.sql
**O que faz:**
- Marca TODOS os eventos existentes como `usado_para_listas = TRUE`
- Permite que apareçam no dashboard
- Facilita testes iniciais

**Quando usar:**
- Após executar eventos-listas-module-v2.sql
- Se quiser que todos os eventos apareçam

**Alternativa:**
- Habilitar manualmente via interface `/admin/eventos/configurar`

---

### teste-rapido.sql
**O que faz:**
- Verifica se tabelas foram criadas
- Conta eventos habilitados
- Lista próximos eventos
- Mostra resumo final

**Resultado esperado:**
```
1️⃣ Verificando tabelas... ✅ OK (6 tabelas)
2️⃣ Campo usado_para_listas... ✅ OK
3️⃣ Eventos habilitados... ✅ OK
4️⃣ Dados de exemplo... ✅ OK
```

**Se algo falhar:**
- Revise os passos anteriores
- Verifique logs de erro

---

### rollback-eventos-listas-v1.sql
**O que faz:**
- Remove tabela `eventos_listas` (se existir)
- Ajusta foreign keys de `listas`
- Prepara para executar V2

**Quando usar:**
- Se você executou eventos-listas-module.sql (V1) antes
- Se aparecer erro "eventos_listas not found"

**NÃO use se:**
- É a primeira vez executando
- Nunca rodou a V1

---

### executar-migracao.sh
**O que faz:**
- Executa automaticamente todos os scripts na ordem
- Pergunta se precisa de rollback
- Valida instalação
- Mostra resultado

**Como usar:**
```bash
chmod +x executar-migracao.sh
./executar-migracao.sh
```

---

## ⚠️ ORDEM DE EXECUÇÃO

**IMPORTANTE:** Execute nesta ordem!

```
1. rollback-eventos-listas-v1.sql         (apenas se já executou V1)
   ↓
2. eventos-listas-module-v2.sql           (OBRIGATÓRIO)
   ↓
3. habilitar-eventos-existentes.sql       (RECOMENDADO)
   ↓
4. teste-rapido.sql                       (VALIDAÇÃO)
```

**OU simplesmente:**
```bash
./executar-migracao.sh
```

---

## 🧪 VALIDAÇÃO PÓS-INSTALAÇÃO

### Verificar Tabelas
```sql
SHOW TABLES LIKE '%listas%';
SHOW TABLES LIKE 'promoters';
SHOW TABLES LIKE 'hostess';
```

**Deve mostrar:** 6+ tabelas

### Verificar Campo
```sql
DESCRIBE eventos;
```

**Deve mostrar:** `usado_para_listas` na lista

### Verificar Eventos Habilitados
```sql
SELECT COUNT(*) FROM eventos WHERE usado_para_listas = TRUE;
```

**Deve retornar:** > 0

### Verificar Dados
```sql
SELECT COUNT(*) FROM promoters;    -- Deve ser >= 4
SELECT COUNT(*) FROM beneficios;   -- Deve ser >= 6
SELECT COUNT(*) FROM hostess;      -- Deve ser >= 4
```

---

## 🚨 TROUBLESHOOTING

### Erro: "Table 'eventos_listas' doesn't exist"
```bash
# Execute rollback e depois V2
SOURCE rollback-eventos-listas-v1.sql;
SOURCE eventos-listas-module-v2.sql;
```

### Erro: "Column 'usado_para_listas' doesn't exist"
```bash
# Execute o script V2 novamente
SOURCE eventos-listas-module-v2.sql;
```

### Erro: "Duplicate key"
```sql
-- Limpar dados antigos
TRUNCATE TABLE lista_convidado_beneficio;
TRUNCATE TABLE listas_convidados;
TRUNCATE TABLE listas;
DROP TABLE IF EXISTS lista_convidado_beneficio;
DROP TABLE IF EXISTS listas_convidados;
DROP TABLE IF EXISTS listas;
DROP TABLE IF EXISTS beneficios;
DROP TABLE IF EXISTS promoters;
DROP TABLE IF EXISTS hostess;

-- Executar V2 novamente
SOURCE eventos-listas-module-v2.sql;
```

### Nenhum evento aparece no dashboard
```sql
-- Habilitar manualmente
UPDATE eventos SET usado_para_listas = TRUE;

-- OU executar:
SOURCE habilitar-eventos-existentes.sql;
```

---

## 📊 COMPATIBILIDADE

### Banco de Dados
- ✅ MySQL 5.7+
- ✅ MariaDB 10.2+

### Encoding
- ✅ UTF8MB4 (suporta emojis)

### Engine
- ✅ InnoDB (transações e FK)

---

## 🔄 MIGRATIONS FUTURAS

Se precisar adicionar novas funcionalidades, crie novos arquivos:

```
eventos-listas-addon-v2.1.sql
eventos-listas-addon-v2.2.sql
...
```

**Nunca modifique os scripts já executados!**

---

## 📞 SUPORTE

### Em caso de problemas:

1. **Verificar logs:**
   ```sql
   SHOW WARNINGS;
   SHOW ERRORS;
   ```

2. **Verificar variáveis:**
   ```sql
   SHOW VARIABLES LIKE 'sql_mode';
   ```

3. **Consultar documentação:**
   - `GUIA_CONFIGURACAO_INICIAL_EVENTOS.md`
   - `SOLUCAO_COMPLETA_EVENTOS_LISTAS.md`

---

## ✅ CHECKLIST FINAL

Antes de considerar concluído:

- [ ] Script V2 executado sem erros
- [ ] 6+ tabelas criadas
- [ ] Campo usado_para_listas existe
- [ ] Eventos habilitados > 0
- [ ] Dados de exemplo inseridos
- [ ] teste-rapido.sql passou
- [ ] Backup do banco realizado (recomendado)

---

**✅ Pronto para usar!**

Execute: `./executar-migracao.sh`




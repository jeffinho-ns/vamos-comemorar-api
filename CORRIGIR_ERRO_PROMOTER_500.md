# 🔧 Como Corrigir o Erro 500 nas Páginas de Promoter

## 🔍 Problema

Ao acessar a página pública do promoter (ex: `https://www.agilizaiapp.com.br/promoter/promojeff`), ocorre erro 500 e a mensagem "Promoter não encontrado".

## 🎯 Causa

A tabela `promoter_convidados` não existe no banco de dados. Esta tabela é necessária para armazenar os convidados que se cadastram via link público.

## ✅ Solução

Execute UM dos métodos abaixo:

### **Método 1: Via Script Node.js (Recomendado)**

No servidor da API (Render ou local), execute:

```bash
npm run diagnose-promoters
```

Este comando irá:
- ✅ Verificar o estado das tabelas
- ✅ Mostrar o que está faltando
- ✅ Indicar exatamente o que fazer

Se o diagnóstico mostrar que falta a tabela, execute:

```bash
npm run migrate-promoter-convidados
```

### **Método 2: Via SQL Direto (phpMyAdmin)**

1. Acesse o phpMyAdmin do banco de dados
2. Selecione o banco `u621081794_vamos`
3. Clique em "SQL"
4. Copie e cole TODO o conteúdo do arquivo:
   - `migrations/EXECUTE_THIS_FIRST.sql`
5. Clique em "Executar"

### **Método 3: Via Render Console**

No painel do Render:
1. Vá em **Shell**
2. Execute:
```bash
node scripts/diagnose-promoter-system.js
```
3. Se mostrar que falta a tabela:
```bash
node scripts/run-promoter-convidados-migration.js
```

## 🧪 Como Testar

Após executar a correção:

1. **Crie um novo promoter** no painel admin
2. **Copie o link** gerado (ex: `https://www.agilizaiapp.com.br/promoter/nome-123456`)
3. **Abra o link** em uma aba anônima
4. Você deve ver:
   - ✅ Foto e nome do promoter
   - ✅ Formulário de cadastro
   - ✅ Estatísticas (0 convidados inicialmente)
   - ✅ Botões de compartilhamento

5. **Preencha o formulário** com:
   - Nome: Teste
   - WhatsApp: 11999999999
6. **Clique em "Entrar na Lista VIP"**
7. Deve aparecer: ✅ "Você foi adicionado à lista com sucesso!"

## 📊 Verificar no Console

No console do servidor (Render Logs), você verá:

```
🔍 Buscando promoter público com código: promojeff
📊 Promoters encontrados: 1
✅ Promoter encontrado: { id: 123, nome: 'Jeff' }
📊 Buscando estatísticas...
✅ Estatísticas obtidas: { total_convidados: 0, total_confirmados: 0 }
```

## ❌ Se Ainda Der Erro

Execute o diagnóstico e envie o resultado:

```bash
npm run diagnose-promoters > diagnostico.txt
```

O diagnóstico mostrará:
- ✅ Se as tabelas existem
- ✅ Se as colunas estão corretas
- ✅ Se os promoters estão cadastrados
- ✅ Se a busca pública funciona

## 📋 Estrutura da Tabela Criada

```sql
promoter_convidados
├── id (PRIMARY KEY)
├── promoter_id (FK -> promoters)
├── nome
├── whatsapp
├── evento_id (opcional)
├── status (pendente/confirmado/cancelado/compareceu)
├── checkin_realizado
├── data_checkin
├── observacoes
├── created_at
└── updated_at
```

## 🔐 Permissões

Certifique-se de que o usuário do banco tem permissão para:
- ✅ CREATE TABLE
- ✅ CREATE INDEX
- ✅ ALTER TABLE
- ✅ INSERT, SELECT, UPDATE, DELETE

## 🆘 Suporte

Se o erro persistir, verifique:
1. Os logs do servidor Render
2. A conexão com o banco de dados
3. Se o promoter está com status "Ativo"
4. Se o código do promoter está correto

---

**Após executar a correção, reinicie o servidor da API no Render para garantir que as mudanças sejam aplicadas.**



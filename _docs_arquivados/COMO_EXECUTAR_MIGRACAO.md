# 📋 Como Executar a Migração - Correção de id_place dos Eventos

Esta migração corrige o campo `id_place` dos eventos e cria listas automáticas quando necessário.

---

## 🚀 **OPÇÃO 1: Via Script Automatizado (RECOMENDADO)**

### Passo 1: Instale as dependências (se ainda não tiver)
```bash
cd vamos-comemorar-api
npm install mysql2
```

### Passo 2: Execute o script
```bash
node scripts/run-migration-id-place.js
```

O script vai:
- ✅ Conectar ao banco de dados automaticamente
- ✅ Executar todas as correções
- ✅ Mostrar os resultados
- ✅ Confirmar se tudo funcionou

---

## 🔧 **OPÇÃO 2: Via phpMyAdmin (Interface Gráfica)**

### Passo 1: Acesse o phpMyAdmin
- Abra seu navegador
- Acesse o phpMyAdmin (geralmente em `http://localhost/phpmyadmin` ou no seu servidor)

### Passo 2: Selecione o banco de dados
- No menu lateral, clique no banco `u621081794_vamos`

### Passo 3: Vá na aba SQL
- Clique na aba **"SQL"** no topo

### Passo 4: Cole o conteúdo do arquivo
- Abra o arquivo: `migrations/habilitar-eventos-para-listas.sql`
- **Copie todo o conteúdo** do arquivo
- **Cole no campo SQL** do phpMyAdmin

### Passo 5: Execute
- Clique no botão **"Executar"** ou **"Go"**
- Aguarde a confirmação de sucesso

---

## 💻 **OPÇÃO 3: Via Linha de Comando MySQL**

### Se você tem acesso SSH ao servidor:

```bash
# Conecte ao MySQL
mysql -u u621081794_vamos -p u621081794_vamos

# Quando pedir, digite a senha: @123Mudar!@

# Execute o arquivo de migração
source /caminho/para/vamos-comemorar-api/migrations/habilitar-eventos-para-listas.sql

# Ou via pipe
mysql -u u621081794_vamos -p u621081794_vamos < migrations/habilitar-eventos-para-listas.sql
```

---

## ✅ **O que a migração faz:**

1. **Corrige `id_place`** dos eventos vinculando a `places` ou `bars` pelo nome
2. **Garante HighLine correto** (id_place = 7) para eventos do HighLine
3. **Habilita listas** para eventos do HighLine (`usado_para_listas = 1`)
4. **Cria "Lista da Casa"** automaticamente para eventos que não têm nenhuma lista

---

## 🧪 **Como verificar se funcionou:**

Após executar, rode estas queries no MySQL:

```sql
-- Ver eventos do HighLine
SELECT 
    e.id,
    e.nome_do_evento,
    e.id_place,
    COALESCE(p.name, b.name) as establishment_name,
    e.usado_para_listas
FROM eventos e
LEFT JOIN places p ON e.id_place = p.id
LEFT JOIN bars b ON e.id_place = b.id
WHERE e.id_place = 7;

-- Ver listas criadas
SELECT 
    l.lista_id,
    l.evento_id,
    e.nome_do_evento,
    l.nome,
    l.tipo
FROM listas l
JOIN eventos e ON l.evento_id = e.id
WHERE e.id_place = 7;
```

---

## ⚠️ **Importante:**

- ✅ A migração é **SEGURA** - não deleta dados, apenas atualiza campos
- ✅ Usa **TRANSACTIONS** - se algo der errado, nada é salvo
- ✅ Pode rodar **múltiplas vezes** sem causar problemas

---

## 🆘 **Se der erro:**

1. Verifique se você tem permissão de escrita no banco
2. Verifique se as tabelas `eventos`, `places`, `bars` e `listas` existem
3. Verifique os logs do script para ver qual query falhou

---

**Recomendação:** Use a **OPÇÃO 1** (script automatizado) pois é mais fácil e mostra o resultado automaticamente!



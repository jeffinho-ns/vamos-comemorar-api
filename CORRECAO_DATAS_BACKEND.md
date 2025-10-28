# 🔧 Correção de Datas - Backend API

## ⚠️ Problema Identificado

**Sintoma:** Eventos criados para dia 31/10 aparecem como 30/10, eventos do dia 24/10 aparecem como 23/10.

**Causa Raiz:** O MySQL retorna campos `DATE` como strings no formato `'YYYY-MM-DD'` (ex: `'2025-10-31'`). Quando o JavaScript no frontend converte isso para um objeto Date:

```javascript
new Date('2025-10-31')
```

O JavaScript interpreta como **UTC 00:00** (meia-noite UTC).
No Brasil (UTC-3), isso se torna **21:00 do dia anterior** (30/10).

---

## ✅ Solução Aplicada

**Backend:** Usar `DATE_FORMAT` no MySQL para garantir que as datas são retornadas como strings no formato correto.

```sql
-- ANTES (ERRADO):
SELECT e.data_do_evento as data_evento FROM eventos e

-- DEPOIS (CORRETO):
SELECT DATE_FORMAT(e.data_do_evento, '%Y-%m-%d') as data_evento FROM eventos e
```

Isso força o MySQL a retornar sempre strings no formato ISO, que o frontend pode processar corretamente.

---

## 📁 Arquivos Corrigidos (Backend)

### 1. `/controllers/EventosController.js`
**Métodos corrigidos:**
- ✅ `getDashboard()` - linha 116, 138
  - Próximo evento único
  - Todos eventos únicos futuros
- ✅ `getEventos()` - linha 269
  - Lista de todos os eventos

**O que foi feito:**
```javascript
// Query corrigida:
DATE_FORMAT(e.data_do_evento, '%Y-%m-%d') as data_evento
```

### 2. `/routes/events.js`
**Rotas corrigidas:**
- ✅ `GET /api/events` - linha 154
  - Lista de eventos para admin

**O que foi feito:**
```javascript
DATE_FORMAT(data_do_evento, '%Y-%m-%d') as data_do_evento
```

### 3. `/routes/promoterEventos.js`
**Rotas corrigidas:**
- ✅ `GET /api/promoter-eventos/:evento_id` - linha 23
  - Lista promoters de um evento
- ✅ `GET /api/promoter-eventos/promoter/:promoter_id` - linha 342
  - Lista eventos de um promoter

**O que foi feito:**
```javascript
DATE_FORMAT(pe.data_evento, '%Y-%m-%d') as data_evento
```

### 4. `/routes/promoterPublic.js`
**Rotas corrigidas:**
- ✅ `GET /api/promoter/:codigo/eventos` - linha 226
  - Lista eventos disponíveis para página pública do promoter

**O que foi feito:**
```javascript
DATE_FORMAT(e.data_do_evento, '%Y-%m-%d') as data
```

---

## 🚀 Como Aplicar as Correções

### ⚠️ IMPORTANTE: Reiniciar o Backend

As correções foram feitas no código do **backend (API)**. Para aplicá-las:

### Opção 1: Ambiente Local

Se estiver rodando localmente:

```bash
# 1. Navegar até o diretório da API
cd vamos-comemorar-api

# 2. Parar o servidor atual
# Pressione Ctrl+C no terminal onde o servidor está rodando

# 3. Iniciar novamente
npm start
# ou
node server.js
```

### Opção 2: Ambiente de Produção (Render)

Se estiver usando Render ou outro serviço de hospedagem:

#### No Render:
1. Acesse o dashboard do Render
2. Selecione o serviço `vamos-comemorar-api`
3. Clique em **"Manual Deploy"** → **"Deploy latest commit"**
4. Ou faça commit e push para o repositório:

```bash
cd vamos-comemorar-api
git add .
git commit -m "fix: Corrige timezone em datas de eventos (backend)"
git push origin main
```

O Render fará deploy automático.

---

## 🧪 Como Testar

### 1. Verificar se o Backend Reiniciou

Acesse a rota de health check:
```
GET https://vamos-comemorar-api.onrender.com/health
```

Ou no local:
```
GET http://localhost:3001/health
```

### 2. Testar Retorno de Datas

Teste a API diretamente:

```bash
# Testar dashboard
curl https://vamos-comemorar-api.onrender.com/api/v1/eventos/dashboard

# Testar lista de eventos
curl https://vamos-comemorar-api.onrender.com/api/v1/eventos

# Testar eventos do promoter
curl https://vamos-comemorar-api.onrender.com/api/promoter/promojeff/eventos
```

**Verifique na resposta que:**
- `data_evento` ou `data` aparecem como strings: `"2025-10-31"`
- As datas **NÃO** são objetos Date JavaScript
- O formato é sempre `YYYY-MM-DD`

### 3. Testar no Frontend

Após reiniciar o backend, teste as páginas:

1. **Limpe o cache do navegador** (Ctrl+Shift+R)
2. Acesse:
   - `/admin/eventos/dashboard`
   - `/admin/eventos/listas`
   - `/promoter/promojeff`
3. **Verifique se as datas estão corretas:**
   - Evento de 31/10 aparece como 31/10 ✅
   - Evento de 24/10 aparece como 24/10 ✅
   - Nenhum "Invalid Date" ✅

---

## 📊 Rotas Afetadas

| Rota | Método | Campo Corrigido | Status |
|------|--------|----------------|--------|
| `/api/v1/eventos/dashboard` | GET | `data_evento` | ✅ |
| `/api/v1/eventos` | GET | `data_evento` | ✅ |
| `/api/events` | GET | `data_do_evento` | ✅ |
| `/api/promoter-eventos/:evento_id` | GET | `data_evento` | ✅ |
| `/api/promoter-eventos/promoter/:id` | GET | `data_evento` | ✅ |
| `/api/promoter/:codigo/eventos` | GET | `data` | ✅ |

---

## 🔍 Debug

### Se ainda aparecer data errada:

1. **Verifique se o backend reiniciou:**
```bash
# Verificar logs do servidor
# No Render, vá em "Logs" e procure por:
Server running on port 3001
```

2. **Verifique a resposta da API no navegador:**
- Abra DevTools (F12)
- Aba "Network"
- Encontre a requisição (ex: `/api/v1/eventos/dashboard`)
- Verifique o JSON de resposta:

```json
{
  "proximoEvento": {
    "nome": "Novo Evento",
    "data_evento": "2025-10-31"  // ✅ Deve ser string, não objeto Date
  }
}
```

3. **Teste direto no backend:**

Se tiver acesso ao servidor:

```bash
# Conectar ao MySQL
mysql -u seu_usuario -p

# Executar query de teste
SELECT 
  nome_do_evento,
  data_do_evento as ORIGINAL,
  DATE_FORMAT(data_do_evento, '%Y-%m-%d') as FORMATADO
FROM eventos 
WHERE id = 27;
```

**Resultado esperado:**
```
+------------------+------------+------------+
| nome_do_evento   | ORIGINAL   | FORMATADO  |
+------------------+------------+------------+
| Novo Evento      | 2025-10-31 | 2025-10-31 |
+------------------+------------+------------+
```

---

## 📝 Linha do Tempo das Correções

### Correção 1 (Frontend)
- ✅ Modificou `formatDate()` em 8 arquivos frontend
- ✅ Adicionou `T12:00:00` ao criar Date objects
- ❌ **Problema:** Backend ainda retornava datas como objetos Date do MySQL

### Correção 2 (Backend) - **ESTA CORREÇÃO**
- ✅ Modificou queries SQL para usar `DATE_FORMAT`
- ✅ Força retorno como string '2025-10-31'
- ✅ Garante que frontend recebe formato correto
- ✅ **Resultado:** Datas sempre corretas independente de timezone

---

## 🎯 Resultado Final Esperado

### Antes (ERRADO):
```
Criar evento: 31/10/2025
Backend retorna: Date object (2025-10-31T00:00:00.000Z)
JavaScript converte: 30/10/2025 21:00 BRT
Mostra na tela: 30/10/2025 ❌
```

### Depois (CORRETO):
```
Criar evento: 31/10/2025
Backend retorna: String "2025-10-31"
Frontend processa: new Date("2025-10-31T12:00:00")
Mostra na tela: 31/10/2025 ✅
```

---

## ✅ Checklist de Deploy

- [ ] Backend reiniciado/deployado
- [ ] Logs do backend sem erros
- [ ] Teste API `/api/v1/eventos/dashboard` → datas corretas
- [ ] Teste API `/api/promoter/promojeff/eventos` → datas corretas
- [ ] Frontend com cache limpo
- [ ] Página `/admin/eventos/dashboard` → datas corretas
- [ ] Página `/admin/eventos/listas` → datas corretas
- [ ] Página `/promoter/promojeff` → datas corretas
- [ ] Evento de 31/10 aparece como 31/10 ✅
- [ ] Evento de 24/10 aparece como 24/10 ✅
- [ ] Nenhum "Invalid Date" ✅

---

## 💡 Prevenção Futura

### Para novos endpoints:

**SEMPRE** use `DATE_FORMAT` ao retornar datas:

```sql
-- ❌ NUNCA FAÇA ISSO:
SELECT data_do_evento FROM eventos

-- ✅ SEMPRE FAÇA ASSIM:
SELECT DATE_FORMAT(data_do_evento, '%Y-%m-%d') as data_do_evento FROM eventos
```

### Para novos campos de data:

1. No MySQL: Use tipo `DATE` ou `DATETIME`
2. No Backend: Use `DATE_FORMAT('%Y-%m-%d')` nas queries
3. No Frontend: Use as funções utilitárias em `dateUtils.ts`

---

## 📞 Suporte

**Se ainda houver problemas após reiniciar o backend:**

1. Verifique os logs do servidor
2. Teste as rotas da API diretamente (curl ou Postman)
3. Confirme que o código foi atualizado no servidor
4. Verifique se não há cache no lado do servidor (Redis, etc.)

---

**Data das Correções:** 2025-10-24  
**Arquivos Modificados:** 4 (backend)  
**Rotas Corrigidas:** 6  
**Status:** ✅ Pronto para Deploy

---

## 🎉 Conclusão

Todas as rotas do backend que retornam datas de eventos foram corrigidas para usar `DATE_FORMAT`. 

**Próximo Passo:**
1. **Reinicie/Redeploy o backend**
2. **Limpe o cache do navegador**
3. **Teste as páginas**

As datas devem aparecer corretamente! 🚀



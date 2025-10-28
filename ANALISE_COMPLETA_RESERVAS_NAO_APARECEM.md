# Análise Completa: Reservas e Listas de Convidados Não Aparecem

## Data: 28 de Outubro de 2025

## 🔍 PROBLEMA IDENTIFICADO

As reservas e listas de convidados não estão aparecendo no calendário e visualização semanal do sistema de reservas do restaurante.

## 🔎 ANÁLISE REALIZADA

### 1. **Estrutura do Banco de Dados ✅**

#### Tabelas Verificadas:
- `restaurant_reservations` - Reservas normais (existe e está populada)
- `large_reservations` - Reservas grandes (existe e está populada)
- `guest_lists` - Listas de convidados (existe e está populada)
- `guests` - Convidados individuais (existe e está populada)

**Status:** ✅ Estrutura correta

### 2. **API Backend ✅**

#### Rotas Verificadas:
- `GET /api/restaurant-reservations` - ✅ Configurada
- `GET /api/large-reservations` - ✅ Configurada
- `GET /api/admin/guest-lists` - ✅ Configurada
- `GET /api/admin/guest-lists/:list_id/guests` - ✅ Configurada

**Servidor (server.js):**
```javascript
// Linha 132-133
app.use('/api/guest-list', guestListPublicRoutes(pool));
app.use('/api/admin', guestListsAdminRoutes(pool));
```

**Status:** ✅ Rotas registradas corretamente

### 3. **Frontend ✅**

#### Componentes Verificados:
- `ReservationCalendar.tsx` - ✅ Recebe e processa reservas
- `WeeklyCalendar.tsx` - ✅ Recebe e processa reservas
- `page.tsx` (restaurant-reservations) - ✅ Faz chamadas à API

**Status:** ✅ Componentes implementados corretamente

---

## ⚠️ PROBLEMA CRÍTICO ENCONTRADO

### **DATAS INCORRETAS NO BANCO DE DADOS**

As reservas no banco de dados estão com **datas de 2024** (ano passado!), enquanto estamos em **outubro de 2025**.

#### Exemplos do SQL:
```sql
-- Reservas com data de 2024:
(96, 7, 'Neila Simões Farias', ..., '2024-11-01', '15:00:00', ...),
(97, 7, 'Neila Simões Farias', ..., '2024-11-01', '15:00:00', ...),
(98, 7, 'Maria Eduarda Gonçalves', ..., '2024-11-01', '19:30:00', ...),
(99, 7, 'Letícia Moreira Guedes', ..., '2024-10-31', '21:30:00', ...),
```

### **Por que isso impede as reservas de aparecer?**

1. **Filtro por mês atual:**
   - O frontend busca por mês: `?month=2025-10`
   - As reservas estão em `2024-10` e `2024-11`
   - Resultado: Nenhuma reserva retornada

2. **Filtros na API:**
   - A API filtra por data/mês
   - Datas passadas podem ser excluídas por alguns filtros

---

## 🔧 PROBLEMAS SECUNDÁRIOS ENCONTRADOS

### 1. **Query da API de Guest Lists**

**Arquivo:** `vamos-comemorar-api/routes/guestListsAdmin.js`

**Linha 31-81:**
```javascript
router.get('/guest-lists', optionalAuth, async (req, res) => {
  try {
    const { date, month, establishment_id } = req.query;
    let whereClauses = [];
    let params = [];

    // Construir os filtros usando COALESCE desde o início
    if (date) {
      whereClauses.push('COALESCE(lr.reservation_date, rr.reservation_date) = ?');
      params.push(date);
    } else if (month) {
      const year = month.split('-')[0];
      const monthNum = month.split('-')[1];
      whereClauses.push('(YEAR(COALESCE(lr.reservation_date, rr.reservation_date)) = ? AND MONTH(COALESCE(lr.reservation_date, rr.reservation_date)) = ?)');
      params.push(year, monthNum);
    } else {
      // ⚠️ PROBLEMA: Por padrão busca apenas o mês atual
      const currentMonth = new Date().toISOString().slice(0, 7);
      const year = currentMonth.split('-')[0];
      const monthNum = currentMonth.split('-')[1];
      whereClauses.push('(YEAR(COALESCE(lr.reservation_date, rr.reservation_date)) = ? AND MONTH(COALESCE(lr.reservation_date, rr.reservation_date)) = ?)');
      params.push(year, monthNum);
    }
```

**Problema:** Se não passar o filtro de mês, busca apenas o mês atual (outubro/2025), excluindo todas as reservas de 2024.

### 2. **Frontend não mostra mensagem quando não há dados**

O frontend carrega os dados mas não mostra mensagem clara quando não há reservas para exibir.

---

## ✅ SOLUÇÕES PROPOSTAS

### **SOLUÇÃO 1: CORRIGIR AS DATAS NO BANCO DE DADOS (RECOMENDADA)**

Atualizar todas as reservas de 2024 para 2025:

```sql
-- Atualizar reservas de restaurant_reservations
UPDATE restaurant_reservations 
SET reservation_date = DATE_ADD(reservation_date, INTERVAL 1 YEAR)
WHERE YEAR(reservation_date) = 2024;

-- Atualizar reservas de large_reservations
UPDATE large_reservations 
SET reservation_date = DATE_ADD(reservation_date, INTERVAL 1 YEAR)
WHERE YEAR(reservation_date) = 2024;

-- Atualizar datas de expiração das guest_lists
UPDATE guest_lists
SET expires_at = DATE_ADD(expires_at, INTERVAL 1 YEAR)
WHERE YEAR(expires_at) = 2024 OR expires_at = '0000-00-00 00:00:00';
```

### **SOLUÇÃO 2: MODIFICAR A API PARA NÃO FILTRAR POR PADRÃO**

**Arquivo:** `vamos-comemorar-api/routes/guestListsAdmin.js`

**Mudança:** Remover o filtro padrão de mês quando nenhum filtro é fornecido:

```javascript
router.get('/guest-lists', optionalAuth, async (req, res) => {
  try {
    const { date, month, establishment_id } = req.query;
    let whereClauses = [];
    let params = [];

    if (date) {
      whereClauses.push('COALESCE(lr.reservation_date, rr.reservation_date) = ?');
      params.push(date);
    } else if (month) {
      const year = month.split('-')[0];
      const monthNum = month.split('-')[1];
      whereClauses.push('(YEAR(COALESCE(lr.reservation_date, rr.reservation_date)) = ? AND MONTH(COALESCE(lr.reservation_date, rr.reservation_date)) = ?)');
      params.push(year, monthNum);
    }
    // ✅ REMOVIDO: filtro padrão de mês atual
    // Agora retorna TODAS as listas se nenhum filtro for especificado
    
    if (establishment_id) {
      whereClauses.push('COALESCE(lr.establishment_id, rr.establishment_id) = ?');
      params.push(establishment_id);
    }
```

### **SOLUÇÃO 3: ADICIONAR OPÇÃO DE VER TODAS AS RESERVAS**

**Arquivo:** `vamos-comemorar-next/app/admin/restaurant-reservations/page.tsx`

Adicionar botão para ver reservas passadas e futuras (não apenas do mês atual).

---

## 📋 RESUMO DO PROBLEMA

| Item | Status | Problema |
|------|--------|----------|
| Estrutura do Banco | ✅ OK | Tabelas existem e estão corretas |
| API Backend | ✅ OK | Rotas configuradas corretamente |
| Frontend | ✅ OK | Componentes implementados |
| **Dados** | ❌ **CRÍTICO** | **Datas de 2024 em vez de 2025** |
| Filtro API | ⚠️ ATENÇÃO | Filtra por mês atual por padrão |

---

## 🎯 RECOMENDAÇÃO FINAL

**EXECUTAR SOLUÇÃO 1 (CORRIGIR AS DATAS)** é a melhor opção porque:
1. ✅ Corrige o problema na raiz
2. ✅ Não requer mudanças no código
3. ✅ As reservas aparecem imediatamente
4. ✅ Mantém a lógica de filtros por mês/data funcionando corretamente

---

## 🚀 PRÓXIMOS PASSOS

1. **Criar script de migração SQL** para corrigir as datas
2. **Executar no banco de dados** de produção/desenvolvimento
3. **Verificar se as reservas aparecem** no calendário
4. **Verificar se as listas de convidados aparecem** na aba Guest Lists

---

## 📝 LOGS DE DEBUG ÚTEIS

Para verificar os dados sendo carregados, o sistema já possui logs:

```javascript
// No frontend (page.tsx):
console.log('✅ Total de reservas carregadas:', allReservations.length);
console.log('🔍 [loadGuestLists] Buscando listas para mês:', selectedMonth);

// No backend (guestListsAdmin.js):
console.log(`✅ Guest Lists encontradas: ${rows.length}`);
```

Verifique o console do navegador e os logs do servidor para confirmar que os dados estão sendo buscados e retornados corretamente.


# 🔧 Guia Rápido: Resolver Problema de Reservas Não Aparecendo

## 📋 Problema

As reservas e listas de convidados não estão aparecendo no calendário e visualização semanal do sistema.

---

## ✅ Solução Rápida (3 Passos)

### **PASSO 1: Executar Script de Correção de Datas** ⭐ RECOMENDADO

```bash
# Entrar no diretório do banco de dados
cd MySql

# Executar o script de correção
mysql -u seu_usuario -p u621081794_vamos < ../vamos-comemorar-api/migrations/corrigir_datas_reservas_2024_para_2025.sql
```

**O que este script faz:**
- ✅ Atualiza reservas de 2024 para 2025
- ✅ Corrige datas de expiração das guest lists
- ✅ Mostra relatório do que foi alterado

---

### **PASSO 2: Reiniciar API (Opcional)**

```bash
cd vamos-comemorar-api

# Se estiver usando PM2
pm2 restart vamos-comemorar-api

# Ou apenas reinicie o servidor Node.js
```

---

### **PASSO 3: Limpar Cache do Frontend**

No navegador:
1. Abrir DevTools (F12)
2. Ir na aba Application/Aplicativo
3. Clicar em "Clear storage" / "Limpar armazenamento"
4. Clicar em "Clear site data" / "Limpar dados do site"
5. Recarregar a página (F5)

---

## 🔍 Testar se Funcionou

### Teste 1: Via Script de Teste

```bash
cd vamos-comemorar-api

# Executar script de teste
AUTH_TOKEN="seu-token" ESTABLISHMENT_ID=7 node scripts/testar-reservas-api.js
```

### Teste 2: Via Navegador

1. Acessar: https://seusite.com/admin/restaurant-reservations
2. Selecionar estabelecimento (ex: HighLine)
3. Ver se as reservas aparecem no calendário
4. Clicar na aba "Listas de Convidados"
5. Ver se as listas aparecem

### Teste 3: Via API Diretamente

```bash
# Testar endpoint de reservas
curl -H "Authorization: Bearer SEU_TOKEN" \
  "https://vamos-comemorar-api.onrender.com/api/restaurant-reservations?establishment_id=7"

# Testar endpoint de guest lists
curl -H "Authorization: Bearer SEU_TOKEN" \
  "https://vamos-comemorar-api.onrender.com/api/admin/guest-lists?show_all=true&establishment_id=7"
```

---

## ⚠️ Se Ainda Não Funcionar

### Debug Passo a Passo

1. **Verificar logs da API:**
   ```bash
   # Ver logs em tempo real
   pm2 logs vamos-comemorar-api
   
   # ou
   tail -f logs/api.log
   ```

2. **Verificar console do navegador:**
   - Abrir DevTools (F12)
   - Ir na aba Console
   - Procurar por mensagens de erro em vermelho
   - Verificar se há erros de autenticação (401, 403)

3. **Verificar Network:**
   - Abrir DevTools (F12)
   - Ir na aba Network/Rede
   - Filtrar por "XHR" ou "Fetch"
   - Verificar requests para:
     - `/api/restaurant-reservations`
     - `/api/large-reservations`
     - `/api/admin/guest-lists`
   - Clicar em cada request e ver a resposta

4. **Verificar banco de dados diretamente:**
   ```sql
   -- Verificar se há reservas
   SELECT COUNT(*) FROM restaurant_reservations WHERE establishment_id = 7;
   
   -- Verificar datas das reservas
   SELECT 
     YEAR(reservation_date) as ano,
     COUNT(*) as total
   FROM restaurant_reservations 
   WHERE establishment_id = 7
   GROUP BY ano;
   
   -- Verificar guest lists
   SELECT COUNT(*) FROM guest_lists gl
   LEFT JOIN restaurant_reservations rr ON gl.reservation_id = rr.id AND gl.reservation_type = 'restaurant'
   LEFT JOIN large_reservations lr ON gl.reservation_id = lr.id AND gl.reservation_type = 'large'
   WHERE COALESCE(rr.establishment_id, lr.establishment_id) = 7;
   ```

---

## 📞 Suporte

Se ainda tiver problemas após seguir estes passos:

1. Envie os logs da API
2. Envie screenshot do console do navegador
3. Envie resultado da query SQL acima
4. Informe:
   - URL da aplicação
   - Estabelecimento que está testando
   - Navegador e versão

---

## 📚 Documentação Completa

Para análise técnica completa, consulte:
- `ANALISE_COMPLETA_RESERVAS_NAO_APARECEM.md`

Para o script SQL:
- `migrations/corrigir_datas_reservas_2024_para_2025.sql`



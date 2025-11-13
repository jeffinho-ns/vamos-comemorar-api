# 🚨 RESOLVER ERRO 500 - GUIA PASSO A PASSO

## 📍 Situação Atual
- ✅ Promoter é criado no banco
- ✅ Link é gerado
- ❌ Ao acessar o link, dá erro 500

## 🔍 PASSO 1: Verificar o Estado Atual

### No Render Shell, execute:
```bash
npm run check-db
```

Este comando vai mostrar:
- ✅ Se a conexão com o banco está OK
- ✅ Se a tabela `promoters` existe
- ✅ Se a tabela `promoter_convidados` existe
- ✅ Quais promoters estão cadastrados
- ✅ Se a query de busca funciona

## 🔧 PASSO 2: Aplicar a Correção

### Se o check-db mostrar que FALTA a tabela `promoter_convidados`:

#### **Opção A: Via phpMyAdmin (Mais Confiável)**

1. Acesse: https://phpmyadmin.hostinger.com
2. Login com suas credenciais
3. Selecione o banco: `u621081794_vamos`
4. Clique em **SQL** (no topo)
5. Cole este código:

```sql
CREATE TABLE IF NOT EXISTS `promoter_convidados` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `promoter_id` INT(11) NOT NULL,
  `nome` VARCHAR(200) NOT NULL,
  `whatsapp` VARCHAR(20) NOT NULL,
  `evento_id` INT(11) DEFAULT NULL,
  `status` ENUM('pendente', 'confirmado', 'cancelado', 'compareceu') DEFAULT 'pendente',
  `checkin_realizado` BOOLEAN DEFAULT FALSE,
  `data_checkin` DATETIME DEFAULT NULL,
  `observacoes` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_promoter_id` (`promoter_id`),
  INDEX `idx_whatsapp` (`whatsapp`),
  INDEX `idx_evento_id` (`evento_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_created_at` (`created_at`),
  FOREIGN KEY (`promoter_id`) REFERENCES `promoters`(`promoter_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

6. Clique em **Executar**
7. Deve aparecer: "✓ Sua consulta SQL foi executada com êxito"

#### **Opção B: Via Render Shell**

```bash
npm run migrate-promoter-convidados
```

## 🔄 PASSO 3: Reiniciar o Serviço

**IMPORTANTE:** Após criar a tabela, você DEVE reiniciar o serviço!

### No Render:
1. Vá em **Dashboard**
2. Clique no serviço da API
3. Clique em **Manual Deploy** → **Clear build cache & deploy**
4. OU clique em **Suspend** e depois **Resume**

## ✅ PASSO 4: Verificar se Funcionou

### Teste 1: Endpoint de Teste
Abra no navegador:
```
https://vamos-comemorar-api.onrender.com/api/promoter/test
```

Deve retornar:
```json
{
  "success": true,
  "message": "Rota de promoter pública funcionando!",
  "timestamp": "2025-01-27T..."
}
```

### Teste 2: Verificar Promoter
Substitua `promojeff` pelo código do seu promoter:
```
https://vamos-comemorar-api.onrender.com/api/promoter/promojeff
```

Deve retornar JSON com os dados do promoter (não erro 500)

### Teste 3: Página Completa
Acesse:
```
https://www.agilizaiapp.com.br/promoter/promojeff
```

Deve mostrar a página bonita com:
- ✅ Foto/nome do promoter
- ✅ Formulário de cadastro
- ✅ Estatísticas
- ✅ Botões de compartilhamento

## 📊 PASSO 5: Ver os Logs

### No Render:
1. Vá em **Logs**
2. Procure por:
   - `🔍 Buscando promoter público com código: promojeff`
   - `✅ Promoter encontrado`
   - `✅ Estatísticas obtidas`

### Se ver erros SQL:
- ❌ `Table 'u621081794_vamos.promoter_convidados' doesn't exist`
  → Volte ao PASSO 2 e crie a tabela

- ❌ `Access denied`
  → Verifique permissões do usuário do banco

## 🆘 Se AINDA Não Funcionar

### Execute este comando e me envie o resultado:
```bash
npm run check-db > resultado.txt
cat resultado.txt
```

### Também verifique:

1. **O promoter está ativo?**
```sql
SELECT promoter_id, nome, codigo_identificador, ativo, status 
FROM promoters 
WHERE codigo_identificador = 'promojeff';
```

Deve retornar:
- `ativo` = 1 (ou TRUE)
- `status` = 'Ativo'

2. **O código está correto?**
- O link gerado usa o campo `codigo_identificador`
- Verifique se o código no link é exatamente o mesmo do banco

3. **A tabela places existe?**
```sql
SELECT COUNT(*) FROM places;
```

## 📝 Checklist Final

Antes de testar, confirme:

- [ ] Tabela `promoter_convidados` existe no banco
- [ ] Serviço da API foi reiniciado no Render
- [ ] O promoter tem `codigo_identificador` preenchido
- [ ] O promoter está com `ativo = TRUE` e `status = 'Ativo'`
- [ ] O código no link corresponde ao `codigo_identificador` do banco

## 🎯 Exemplo de Sucesso

### Logs que você DEVE ver:
```
🔍 Buscando promoter público com código: promojeff
📊 Promoters encontrados: 1
✅ Promoter encontrado: { id: 5, nome: 'Jeff' }
📊 Buscando estatísticas...
✅ Estatísticas obtidas: { total_convidados: 0, total_confirmados: 0 }
📊 Buscando eventos...
✅ Eventos encontrados: 0
📊 Buscando convidados...
✅ Convidados encontrados: 0
```

### Página que você DEVE ver:
- Header roxo/rosa com foto
- Nome do promoter em destaque
- Formulário com campos Nome e WhatsApp
- Botão "Entrar na Lista VIP"
- Seção de convidados (vazia no início)

---

**Se seguir todos os passos e ainda não funcionar, me envie:**
1. Resultado do `npm run check-db`
2. Screenshot dos logs do Render
3. O `codigo_identificador` exato do promoter que você está testando












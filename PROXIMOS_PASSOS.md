# 🚀 Próximos Passos - Migração OneDrive

## ✅ Passo 1: Configurar Variáveis de Ambiente - CONCLUÍDO

As variáveis de ambiente foram configuradas no Render:
- ✅ MS_CLIENT_ID
- ✅ MS_TENANT_ID  
- ✅ MS_CLIENT_SECRET
- ✅ FTP_HOST, FTP_USER, FTP_PASSWORD, FTP_ROOT_PATH

## 🧪 Passo 2: Testar o Serviço OneDrive

Antes de executar a migração completa, é importante testar se o serviço OneDrive está funcionando corretamente.

### Opção 1: Usando npm script (recomendado)

```bash
npm run test-onedrive
```

### Opção 2: Executar diretamente

```bash
node scripts/test-onedrive-service.js
```

### O que o teste faz:

1. ✅ Verifica se as variáveis de ambiente estão configuradas
2. ✅ Testa a autenticação com o Microsoft Graph API
3. ✅ Faz upload de um arquivo de teste para o OneDrive
4. ✅ Verifica se a URL pública é acessível
5. ✅ Deleta o arquivo de teste

### Resultado esperado:

```
🧪 Testando Serviço OneDrive
============================================================

📋 Verificando variáveis de ambiente...
✅ MS_CLIENT_ID: ✅ Configurado
✅ MS_TENANT_ID: ✅ Configurado
✅ MS_CLIENT_SECRET: ✅ Configurado

🔐 Teste 1: Autenticação (obter access token)
✅ Autenticação bem-sucedida!

📤 Teste 2: Upload de arquivo de teste
✅ Upload bem-sucedido!
   URL pública: https://...

🌐 Teste 3: Verificando acessibilidade da URL
✅ URL pública é acessível!

🗑️ Teste 4: Deletar arquivo de teste
✅ Arquivo de teste deletado com sucesso!

============================================================
✅ TODOS OS TESTES PASSARAM!
============================================================

🎉 O serviço OneDrive está funcionando corretamente.
✅ Você pode prosseguir com a migração de imagens.
```

## 💾 Passo 3: Fazer Backup do Banco de Dados

**⚠️ CRÍTICO: Faça backup antes de executar a migração!**

### Opções de backup:

1. **Via Render Dashboard:**
   - Acesse o dashboard do Render
   - Vá em **Databases** → Seu banco PostgreSQL
   - Clique em **Backups** → **Create Backup**

2. **Via linha de comando (se tiver acesso):**
   ```bash
   pg_dump -h [HOST] -U [USER] -d [DATABASE] > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

3. **Via script (se configurado):**
   - Verifique se há scripts de backup no projeto

## 🔄 Passo 4: Executar a Migração

Após confirmar que os testes passaram e o backup foi feito:

### Opção 1: Usando npm script (recomendado)

```bash
npm run migrate-onedrive
```

### Opção 2: Executar diretamente

```bash
node scripts/migrate-images-to-onedrive.js
```

### O que a migração faz:

1. 🔍 Identifica todos os registros com URLs do FTP
2. 📥 Faz download de cada arquivo do FTP
3. 📤 Faz upload para o OneDrive
4. 🔗 Obtém URL pública do OneDrive
5. 💾 Atualiza o banco de dados com a nova URL
6. 📊 Gera relatório final com estatísticas

### Durante a migração:

- ⏱️ Pode levar vários minutos dependendo da quantidade de imagens
- 📝 Logs detalhados são exibidos para cada arquivo
- ⚠️ Erros são registrados mas não interrompem o processo
- ✅ Estatísticas são exibidas ao final

### Exemplo de saída:

```
🚀 Iniciando migração de imagens: FTP → OneDrive
============================================================
📅 Data/Hora: 2025-01-XX...
✅ Conexão com banco de dados estabelecida
✅ Autenticação OneDrive OK

📋 Migrando tabela: cardapio_images
   Encontrados 150 registros para migrar
   📥 Fazendo download do FTP: ABC123.jpg
   ✅ Download do FTP: ABC123.jpg (245678 bytes)
   📤 Fazendo upload para OneDrive: ABC123.jpg
   ✅ Upload completo e URL pública gerada: https://...
   ✅ Migração concluída

...

============================================================
📊 RELATÓRIO FINAL DA MIGRAÇÃO
============================================================
✅ Sucessos: 145
❌ Falhas: 3
⏭️  Pulados: 2
📊 Total processado: 150
⏱️  Tempo total: 1234.56s

✅ Migração concluída!
```

## ✅ Passo 5: Verificar Resultados

Após a migração, verifique:

1. **Testar upload de nova imagem:**
   - Acesse o front-end
   - Faça upload de uma nova imagem
   - Verifique se a URL retornada é do OneDrive

2. **Verificar imagens migradas:**
   - Acesse algumas páginas que exibem imagens
   - Confirme que as imagens estão carregando corretamente
   - Verifique se as URLs no banco foram atualizadas

3. **Verificar logs:**
   - Revise o relatório final da migração
   - Se houver erros, verifique os detalhes
   - Execute novamente se necessário (script é idempotente)

## 🔍 Troubleshooting

### Erro: "Credenciais do Microsoft Graph API não configuradas"

**Solução:** Verifique se as variáveis de ambiente estão configuradas no Render e faça o deploy novamente.

### Erro: "Falha na autenticação"

**Solução:**
- Verifique se as credenciais estão corretas
- Confirme que o aplicativo está registrado no Azure AD
- Verifique se o Client Secret não expirou

### Erro: "Arquivo não encontrado no FTP"

**Solução:**
- Alguns arquivos podem ter sido deletados manualmente
- O script continuará com os outros arquivos
- Revise os erros no relatório final

### Imagens não aparecem após migração

**Solução:**
- Verifique se a URL do OneDrive está acessível publicamente
- Teste a URL diretamente no navegador
- Confirme que o link compartilhado foi criado corretamente

## 📞 Suporte

Se encontrar problemas:
1. Revise os logs detalhados
2. Verifique o relatório final da migração
3. Execute o script de teste novamente
4. Consulte `MIGRACAO_ONEDRIVE.md` para mais detalhes

## ✅ Checklist Final

- [x] Passo 1: Variáveis de ambiente configuradas
- [ ] Passo 2: Teste do serviço OneDrive executado
- [ ] Passo 3: Backup do banco de dados realizado
- [ ] Passo 4: Migração executada
- [ ] Passo 5: Resultados verificados


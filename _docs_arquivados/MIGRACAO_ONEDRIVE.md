# 🚀 Migração de Imagens: FTP Hostinger → Microsoft OneDrive

## 📋 Visão Geral

Este documento descreve a migração completa do sistema de armazenamento de imagens do FTP da Hostinger para o Microsoft OneDrive usando a Graph API.

## 🎯 Objetivo

Migrar todas as imagens armazenadas no FTP para o OneDrive, garantindo:
- ✅ Zero downtime para usuários finais
- ✅ Migração transacional e segura
- ✅ Compatibilidade com dados legados durante a transição
- ✅ Sistema totalmente desacoplado do FTP após migração

## 📦 Componentes Implementados

### 1. Serviço OneDrive (`services/onedriveService.js`)

Serviço completo para gerenciar operações no OneDrive:
- ✅ Autenticação via Client Credentials Grant (OAuth 2.0)
- ✅ Cache e renovação automática de access tokens
- ✅ Upload de arquivos (`uploadFile`)
- ✅ Geração de links públicos compartilháveis (`getShareLink`)
- ✅ Método combinado (`uploadFileAndGetPublicUrl`)
- ✅ Deletar arquivos (`deleteFile`)

### 2. Rota de Upload Atualizada (`routes/images.js`)

A rota `/api/images/upload` foi completamente refatorada:
- ✅ Removida dependência do FTP
- ✅ Integração com `onedriveService`
- ✅ Upload direto para OneDrive
- ✅ Retorno de URL pública do OneDrive
- ✅ Rollback automático em caso de erro no banco

### 3. Script de Migração (`scripts/migrate-images-to-onedrive.js`)

Script de uso único para migrar imagens existentes:
- ✅ Identifica todas as tabelas com URLs do FTP
- ✅ Download de arquivos do FTP
- ✅ Upload para OneDrive
- ✅ Atualização transacional no banco
- ✅ Logging detalhado e relatório final

### 4. Rotas Atualizadas

Rotas que constroem URLs de imagens foram atualizadas para suportar:
- ✅ URLs completas do OneDrive (novas)
- ✅ Filenames legados do FTP (compatibilidade durante migração)

**Arquivos atualizados:**
- `routes/events.js` - Função `addFullImageUrls` atualizada
- `routes/promoterPublic.js` - Construção de URLs atualizada

## 🔧 Configuração

### Variáveis de Ambiente

Adicione as seguintes variáveis de ambiente no Render (ou seu servidor):

```bash
# Microsoft OneDrive / Graph API
MS_CLIENT_ID=16885a0b-840c-410b-879c-5bd0c6e6a040
MS_TENANT_ID=b6abf480-4ef9-4e65-b35c-fbfd7d53691e
MS_CLIENT_SECRET=seu_client_secret_aqui

# FTP (mantido apenas para migração)
FTP_HOST=195.35.41.247
FTP_USER=u621081794
FTP_PASSWORD=Jeffl1ma!@
FTP_ROOT_PATH=/public_html/cardapio-agilizaiapp/
```

### Configuração no Render

1. Acesse o dashboard do Render
2. Vá em **Environment** na sua aplicação
3. Adicione as variáveis acima
4. Faça o deploy

## 📊 Tabelas e Colunas Migradas

O script de migração processa as seguintes tabelas:

| Tabela | Colunas |
|--------|---------|
| `cardapio_images` | `url` |
| `menu_items` | `imageurl` |
| `bars` | `logourl`, `coverimageurl`, `popupimageurl` |
| `users` | `foto_perfil` |
| `eventos` | `imagem_do_evento`, `imagem_do_combo` |
| `promoters` | `foto_url` |

## 🚀 Executando a Migração

### Pré-requisitos

1. ✅ Variáveis de ambiente configuradas
2. ✅ Backup do banco de dados realizado
3. ✅ Serviço OneDrive testado e funcionando
4. ✅ Acesso ao FTP da Hostinger ainda disponível

### Passo a Passo

1. **Teste o serviço OneDrive:**
   ```bash
   # No servidor ou localmente
   node -e "const s = require('./services/onedriveService'); s.getAccessToken().then(() => console.log('✅ OK')).catch(e => console.error('❌', e))"
   ```

2. **Execute o script de migração:**
   ```bash
   node scripts/migrate-images-to-onedrive.js
   ```

3. **Monitore o progresso:**
   - O script exibe logs detalhados de cada etapa
   - Mostra estatísticas de sucesso/falha
   - Gera relatório final com erros (se houver)

4. **Verifique os resultados:**
   - Confirme que as URLs no banco foram atualizadas
   - Teste algumas imagens no front-end
   - Verifique se novas imagens estão sendo salvas no OneDrive

### Exemplo de Saída

```
🚀 Iniciando migração de imagens: FTP → OneDrive
============================================================
📅 Data/Hora: 2025-01-XX...
🔧 Configurações:
   FTP Host: 195.35.41.247
   FTP Directory: /public_html/cardapio-agilizaiapp/
   OneDrive Client ID: ✅ Configurado
============================================================
✅ Conexão com banco de dados estabelecida
✅ Autenticação OneDrive OK

📋 Migrando tabela: cardapio_images
   Encontrados 150 registros para migrar
   📥 Fazendo download do FTP: ABC123.jpg
   ✅ Download do FTP: ABC123.jpg (245678 bytes)
   📤 Fazendo upload para OneDrive: ABC123.jpg
   ✅ Upload completo e URL pública gerada: https://...
   ✅ Migração concluída: https://grupoideiaum.com.br/... → https://...

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

## 🔄 Fluxo de Funcionamento

### Upload de Novas Imagens

1. Front-end envia arquivo para `/api/images/upload`
2. Back-end recebe arquivo via Multer (memory storage)
3. `onedriveService.uploadFileAndGetPublicUrl()` faz upload para OneDrive
4. URL pública do OneDrive é retornada
5. URL é salva no banco de dados
6. Front-end recebe URL completa para exibição

### Exibição de Imagens

1. Back-end retorna dados com URLs de imagens
2. Se URL é completa (OneDrive), usa diretamente
3. Se ainda é filename (legado), constrói URL do FTP (compatibilidade)
4. Front-end exibe imagem usando a URL

## ⚠️ Importante

### Durante a Migração

- ✅ Sistema continua funcionando normalmente
- ✅ Novas imagens já vão para OneDrive
- ✅ Imagens antigas ainda funcionam via FTP
- ✅ Script de migração processa imagens antigas em background

### Após a Migração

- ✅ Todas as URLs no banco apontam para OneDrive
- ✅ Sistema não depende mais do FTP
- ✅ FTP pode ser desativado (após verificação)
- ✅ Front-ends funcionam normalmente (suportam ambos os formatos)

## 🐛 Troubleshooting

### Erro: "Credenciais do Microsoft Graph API não configuradas"

**Solução:** Verifique se as variáveis `MS_CLIENT_ID`, `MS_TENANT_ID` e `MS_CLIENT_SECRET` estão configuradas.

### Erro: "Falha na autenticação"

**Solução:** 
- Verifique se as credenciais estão corretas
- Confirme que o aplicativo está registrado no Azure AD
- Verifique se o Client Secret não expirou

### Erro: "Arquivo não encontrado no FTP"

**Solução:**
- Verifique se o arquivo existe no FTP
- Confirme o caminho correto (`FTP_ROOT_PATH`)
- Alguns arquivos podem ter sido deletados manualmente

### Imagens não aparecem após migração

**Solução:**
- Verifique se a URL do OneDrive está acessível publicamente
- Confirme que o link compartilhado foi criado corretamente
- Teste a URL diretamente no navegador

## 📝 Notas Finais

- O script de migração é **idempotente**: pode ser executado múltiplas vezes sem causar problemas
- URLs já migradas (que contêm "onedrive" ou "sharepoint") são puladas automaticamente
- O sistema mantém compatibilidade com URLs legadas durante a transição
- Após confirmação de que tudo funciona, o código de compatibilidade com FTP pode ser removido

## 🔗 Referências

- [Microsoft Graph API Documentation](https://docs.microsoft.com/en-us/graph/)
- [OneDrive API Reference](https://docs.microsoft.com/en-us/graph/api/resources/onedrive)
- [OAuth 2.0 Client Credentials Flow](https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-client-creds-grant-flow)


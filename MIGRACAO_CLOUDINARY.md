# 🚀 Migração de Imagens: FTP Hostinger → Cloudinary

## 📋 Visão Geral

Este documento descreve a migração completa do sistema de armazenamento de imagens do FTP da Hostinger para o Cloudinary.

## 🎯 Objetivo

Migrar todas as imagens armazenadas no FTP para o Cloudinary, garantindo:
- ✅ Zero downtime para usuários finais
- ✅ Migração transacional e segura
- ✅ Compatibilidade com dados legados durante a transição
- ✅ Sistema totalmente desacoplado do FTP após migração

## 📦 Componentes Implementados

### 1. Serviço Cloudinary (`services/cloudinaryService.js`)

Serviço completo para gerenciar operações no Cloudinary:
- ✅ Upload de arquivos (`uploadFile`)
- ✅ Geração automática de URLs públicas seguras
- ✅ Deletar arquivos (`deleteFile`)
- ✅ Método combinado (`uploadFileAndGetPublicUrl`)
- ✅ Extração de Public ID de URLs
- ✅ Geração de URLs otimizadas

### 2. Rota de Upload Atualizada (`routes/images.js`)

A rota `/api/images/upload` foi completamente refatorada:
- ✅ Removida dependência do OneDrive/Azure
- ✅ Integração com `cloudinaryService`
- ✅ Upload direto para Cloudinary
- ✅ Retorno de URL pública do Cloudinary
- ✅ Rollback automático em caso de erro no banco

### 3. Script de Migração (`scripts/migrate-images-to-cloudinary.js`)

Script de uso único para migrar imagens existentes:
- ✅ Identifica todas as tabelas com URLs do FTP
- ✅ Download de arquivos do FTP
- ✅ Upload para Cloudinary
- ✅ Atualização transacional no banco
- ✅ Logging detalhado e relatório final

### 4. Rotas Atualizadas

Rotas que constroem URLs de imagens foram atualizadas para suportar:
- ✅ URLs completas do Cloudinary (novas)
- ✅ Filenames legados do FTP (compatibilidade durante migração)

**Arquivos atualizados:**
- `routes/events.js` - Função `addFullImageUrls` atualizada
- `routes/promoterPublic.js` - Construção de URLs atualizada

## 🔧 Configuração

### Variáveis de Ambiente

Adicione as seguintes variáveis de ambiente no Render (ou seu servidor):

```bash
# Cloudinary
CLOUDINARY_CLOUD_NAME=drjovtmuw
CLOUDINARY_API_KEY=374156943557746
CLOUDINARY_API_SECRET=1bswwWFdDXQ1YDCxwc1CmCDhvDk

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
3. ✅ Serviço Cloudinary testado e funcionando
4. ✅ Acesso ao FTP da Hostinger ainda disponível

### Passo a Passo

1. **Teste o serviço Cloudinary:**
   ```bash
   npm run test-cloudinary
   ```
   Ou:
   ```bash
   node scripts/test-cloudinary-service.js
   ```

2. **Execute o script de migração:**
   ```bash
   npm run migrate-cloudinary
   ```
   Ou:
   ```bash
   node scripts/migrate-images-to-cloudinary.js
   ```

3. **Monitore o progresso:**
   - O script exibe logs detalhados de cada etapa
   - Mostra estatísticas de sucesso/falha
   - Gera relatório final com erros (se houver)

4. **Verifique os resultados:**
   - Confirme que as URLs no banco foram atualizadas
   - Teste algumas imagens no front-end
   - Verifique se novas imagens estão sendo salvas no Cloudinary

## 🔄 Fluxo de Funcionamento

### Upload de Novas Imagens

1. Front-end envia arquivo para `/api/images/upload`
2. Back-end recebe arquivo via Multer (memory storage)
3. `cloudinaryService.uploadFile()` faz upload para Cloudinary
4. URL pública do Cloudinary é retornada
5. URL é salva no banco de dados
6. Front-end recebe URL completa para exibição

### Exibição de Imagens

1. Back-end retorna dados com URLs de imagens
2. Se URL é completa (Cloudinary), usa diretamente
3. Se ainda é filename (legado), constrói URL do FTP (compatibilidade)
4. Front-end exibe imagem usando a URL

## ⚠️ Importante

### Durante a Migração

- ✅ Sistema continua funcionando normalmente
- ✅ Novas imagens já vão para Cloudinary
- ✅ Imagens antigas ainda funcionam via FTP
- ✅ Script de migração processa imagens antigas em background

### Após a Migração

- ✅ Todas as URLs no banco apontam para Cloudinary
- ✅ Sistema não depende mais do FTP
- ✅ FTP pode ser desativado (após verificação)
- ✅ Front-ends funcionam normalmente (suportam ambos os formatos)

## 🐛 Troubleshooting

### Erro: "Credenciais do Cloudinary não configuradas"

**Solução:** Verifique se as variáveis `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` e `CLOUDINARY_API_SECRET` estão configuradas.

### Erro: "Arquivo não encontrado no FTP"

**Solução:**
- Verifique se o arquivo existe no FTP
- Confirme o caminho correto (`FTP_ROOT_PATH`)
- Alguns arquivos podem ter sido deletados manualmente

### Imagens não aparecem após migração

**Solução:**
- Verifique se a URL do Cloudinary está acessível publicamente
- Teste a URL diretamente no navegador
- Confirme que o upload foi bem-sucedido

## 📝 Notas Finais

- O script de migração é **idempotente**: pode ser executado múltiplas vezes sem causar problemas
- URLs já migradas (que contêm "cloudinary.com") são puladas automaticamente
- O sistema mantém compatibilidade com URLs legadas durante a transição
- Após confirmação de que tudo funciona, o código de compatibilidade com FTP pode ser removido

## 🔗 Referências

- [Cloudinary Documentation](https://cloudinary.com/documentation)
- [Cloudinary Node.js SDK](https://cloudinary.com/documentation/node_integration)





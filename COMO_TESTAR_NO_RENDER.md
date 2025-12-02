# 🧪 Como Testar o OneDrive no Render

## Passo 1: Fazer Deploy no Render

1. **Commit e Push das alterações:**
   ```bash
   git add .
   git commit -m "Implementação OneDrive - adicionar endpoint de teste"
   git push
   ```

2. **O Render fará deploy automaticamente** (se tiver auto-deploy configurado)

## Passo 2: Verificar Variáveis de Ambiente no Render

1. Acesse: https://dashboard.render.com
2. Vá em seu serviço `vamos-comemorar-api`
3. Clique em **Environment**
4. Verifique se estas variáveis estão configuradas:
   - `MS_CLIENT_ID` = `535231ba-8b02-4946-8e94-5718be858965`
   - `MS_TENANT_ID` = `b6abf480-4ef9-4e65-b35c-fbfd7d53691e`
   - `MS_CLIENT_SECRET` = `seu_client_secret_aqui`

## Passo 3: Testar o Endpoint de OneDrive

### Opção A: Via Navegador

1. Anote a URL do seu serviço no Render (ex: `https://vamos-comemorar-api.onrender.com`)
2. Abra no navegador:
   ```
   https://vamos-comemorar-api.onrender.com/test-onedrive
   ```

### Opção B: Via Terminal (curl)

```bash
curl https://vamos-comemorar-api.onrender.com/test-onedrive
```

### Resposta Esperada (Sucesso):

```json
{
  "success": true,
  "message": "✅ Autenticação OneDrive funcionando!",
  "details": {
    "tokenPreview": "eyJ0eXAiOiJKV1QiLCJ...",
    "tokenLength": 1234,
    "timestamp": "2025-12-02T..."
  }
}
```

### Resposta de Erro:

```json
{
  "success": false,
  "error": "Erro na autenticação OneDrive",
  "details": {
    "message": "..."
  }
}
```

## Passo 4: Verificar Logs no Render

1. No Dashboard do Render, vá em **Logs**
2. Procure por mensagens relacionadas ao OneDrive
3. Verifique se há erros de autenticação

## Passo 5: Testar Upload de Imagem (Se autenticação funcionar)

Se o teste de autenticação passar, você pode testar o upload:

```bash
curl -X POST https://vamos-comemorar-api.onrender.com/api/images/upload \
  -F "image=@/caminho/para/imagem.jpg" \
  -F "type=test"
```

## Troubleshooting

### Erro: "Variáveis de ambiente não configuradas"
- Verifique se as variáveis estão configuradas no Render
- Faça um novo deploy após adicionar as variáveis

### Erro: "Erro na autenticação OneDrive"
- Verifique os logs no Render para mais detalhes
- Confirme que as variáveis estão corretas
- Pode ser necessário aguardar propagação do Azure

### Serviço não responde
- Verifique se o serviço está "Live" no Render
- Verifique os logs para erros de inicialização


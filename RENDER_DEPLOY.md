# 🚀 Deploy no Render - API Vamos Comemorar

## 📋 Pré-requisitos

- Conta no Render (https://render.com)
- Repositório Git com o código
- Acesso ao banco de dados MySQL

## 🔧 Configuração no Render

### 1. Criar Novo Web Service

1. Acesse https://dashboard.render.com
2. Clique em "New +" → "Web Service"
3. Conecte seu repositório Git
4. Configure o serviço:

### 2. Configurações do Serviço

**Name**: `vamos-comemorar-api`
**Environment**: `Node`
**Region**: `Oregon (US West)`
**Branch**: `main`
**Root Directory**: (deixe vazio)

### 3. Build & Deploy Settings

**Build Command**: `npm install`
**Start Command**: `npm start`

### 4. Environment Variables

Adicione as seguintes variáveis de ambiente:

```bash
NODE_ENV=production
PORT=10000

# Database
DB_HOST=193.203.175.55
DB_USER=u621081794_vamos
DB_PASSWORD=@123Mudar!@
DB_NAME=u621081794_vamos

# FTP
FTP_HOST=195.35.41.247
FTP_USER=u621081794
FTP_PASSWORD=Jeffl1ma!@
FTP_PORT=21
FTP_SECURE=false
FTP_REMOTE_DIR=/cardapio-agilizaiapp/
FTP_BASE_URL=https://www.grupoideiaum.com.br/cardapio-agilizaiapp/
```

## 🚀 Deploy

### 1. Push para o Git
```bash
git add .
git commit -m "Deploy para Render"
git push origin main
```

### 2. Deploy Automático
O Render fará o deploy automaticamente após o push.

### 3. Verificar Deploy
- Acesse o dashboard do Render
- Verifique os logs do deploy
- Teste a URL: `https://vamos-comemorar-api.onrender.com`

## 🧪 Testes

### 1. Testar API
```bash
curl https://vamos-comemorar-api.onrender.com/api/images/list
```

### 2. Testar Upload
```bash
curl -X POST https://vamos-comemorar-api.onrender.com/api/images/upload \
  -F "image=@test-image.jpg" \
  -F "type=test"
```

### 3. Testar Frontend
- Acesse: https://vamos-comemorar-next.vercel.app/admin/cardapio
- Teste o upload de uma imagem

## 📊 Monitoramento

### Logs
- Acesse o dashboard do Render
- Vá em "Logs" para ver os logs em tempo real

### Health Check
- URL: `https://vamos-comemorar-api.onrender.com/health`
- Deve retornar status 200

## 🔧 Troubleshooting

### Problema: Deploy falha
1. Verificar logs no Render
2. Verificar se todas as variáveis de ambiente estão configuradas
3. Verificar se o banco de dados está acessível

### Problema: CORS error
1. Verificar se o domínio está na lista de origins
2. Verificar configuração CORS no código

### Problema: Upload não funciona
1. Verificar credenciais FTP
2. Verificar se o diretório FTP existe
3. Verificar logs do servidor

## 📁 Estrutura de Arquivos

```
vamos-comemorar-api/
├── server.js                 # Servidor principal
├── render.yaml              # Configuração Render
├── package.json             # Dependências e scripts
├── config/
│   ├── development.js       # Configurações de desenvolvimento
│   ├── production.js        # Configurações de produção
│   └── environment.js       # Configurações de ambiente
├── routes/
│   └── images.js           # API de imagens
└── migrations/
    └── create_cardapio_images_table.sql
```

## 🌐 URLs

- **API**: https://vamos-comemorar-api.onrender.com
- **Frontend**: https://vamos-comemorar-next.vercel.app
- **Imagens**: https://www.grupoideiaum.com.br/cardapio-agilizaiapp/

## 📝 Comandos Úteis

### Verificar Status
```bash
curl -I https://vamos-comemorar-api.onrender.com
```

### Verificar Logs
- Dashboard Render → Logs

### Reiniciar Serviço
- Dashboard Render → Manual Deploy

## 🎯 Próximos Passos

1. **Fazer deploy no Render**
2. **Configurar variáveis de ambiente**
3. **Testar upload de imagens**
4. **Verificar se as imagens aparecem no FTP**
5. **Testar no frontend de produção**

## ✅ Checklist de Deploy

- [ ] Repositório conectado ao Render
- [ ] Variáveis de ambiente configuradas
- [ ] Deploy bem-sucedido
- [ ] API respondendo corretamente
- [ ] Upload de imagens funcionando
- [ ] Frontend conectado à API
- [ ] Testes realizados com sucesso 
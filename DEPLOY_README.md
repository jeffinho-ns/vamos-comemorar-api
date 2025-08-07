# 🚀 Deploy da API - Vamos Comemorar

## 📋 Pré-requisitos

- Node.js 18+ instalado no servidor
- PM2 instalado globalmente: `npm install -g pm2`
- Acesso FTP ao servidor
- Acesso SSH ao servidor

## 🔧 Configuração do Servidor

### 1. Instalar PM2
```bash
npm install -g pm2
```

### 2. Configurar Nginx (se necessário)
```nginx
server {
    listen 80;
    server_name www.grupoideiaum.com.br;
    
    location /api/ {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    location /cardapio-agilizaiapp/ {
        alias /path/to/cardapio-agilizaiapp/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

## 🚀 Deploy

### Opção 1: Deploy Automático
```bash
./deploy.sh
```

### Opção 2: Deploy Manual
```bash
# 1. Instalar dependências
npm install

# 2. Executar migração
node run_cardapio_migration.js

# 3. Parar processo anterior
pm2 stop vamos-comemorar-api
pm2 delete vamos-comemorar-api

# 4. Iniciar aplicação
pm2 start ecosystem.config.js --env production

# 5. Salvar configuração
pm2 save
```

## 📊 Comandos Úteis

### Verificar status
```bash
pm2 status
```

### Ver logs
```bash
pm2 logs vamos-comemorar-api
```

### Reiniciar aplicação
```bash
pm2 restart vamos-comemorar-api
```

### Parar aplicação
```bash
pm2 stop vamos-comemorar-api
```

## 🔍 Testes

### Testar API
```bash
curl https://www.grupoideiaum.com.br/api/images/list
```

### Testar Upload
```bash
curl -X POST https://www.grupoideiaum.com.br/api/images/upload \
  -F "image=@test-image.jpg" \
  -F "type=test"
```

## 🛠️ Troubleshooting

### Problema: Porta 5001 não acessível
- Verificar se o firewall permite a porta
- Verificar se o PM2 está rodando: `pm2 status`

### Problema: Erro de CORS
- Verificar configuração no `config/production.js`
- Verificar se o domínio está na lista de origins permitidos

### Problema: Upload FTP falha
- Verificar credenciais FTP no `config/production.js`
- Testar conexão FTP: `node scripts/test-ftp.js`

## 📁 Estrutura de Arquivos

```
vamos-comemorar-api/
├── server.js                 # Servidor principal
├── ecosystem.config.js       # Configuração PM2
├── deploy.sh                 # Script de deploy
├── config/
│   └── production.js         # Configurações de produção
├── routes/
│   └── images.js            # API de imagens
├── migrations/
│   └── create_cardapio_images_table.sql
└── logs/                    # Logs do PM2
```

## 🔐 Variáveis de Ambiente

As configurações estão no arquivo `config/production.js`:
- **Database**: MySQL no servidor remoto
- **FTP**: Servidor FTP para upload de imagens
- **CORS**: Domínios permitidos
- **Upload**: Configurações de upload

## 📞 Suporte

Em caso de problemas:
1. Verificar logs: `pm2 logs vamos-comemorar-api`
2. Verificar status: `pm2 status`
3. Reiniciar aplicação: `pm2 restart vamos-comemorar-api` 
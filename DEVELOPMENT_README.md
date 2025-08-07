# 🛠️ Desenvolvimento - API Vamos Comemorar

## 🚀 Como Iniciar o Desenvolvimento

### 1. Iniciar o Backend (Terminal 1)
```bash
cd vamos-comemorar-api
./start-dev.sh
```

Ou manualmente:
```bash
cd vamos-comemorar-api
NODE_ENV=development node server.js
```

### 2. Iniciar o Frontend (Terminal 2)
```bash
cd vamos-comemorar-next
npm run dev
```

## 🌐 URLs de Desenvolvimento

- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:5001
- **API Images**: http://localhost:5001/api/images

## 📋 Endpoints da API

### Upload de Imagem
```
POST http://localhost:5001/api/images/upload
Content-Type: multipart/form-data

Parâmetros:
- image: arquivo
- type: string (opcional)
- entityId: number (opcional)
- entityType: string (opcional)
```

### Listar Imagens
```
GET http://localhost:5001/api/images/list
```

### Buscar Imagem por ID
```
GET http://localhost:5001/api/images/:id
```

### Deletar Imagem
```
DELETE http://localhost:5001/api/images/:id
```

## 🔧 Configurações

### CORS
O servidor está configurado para aceitar requisições de:
- http://localhost:3000
- http://localhost:3001
- http://127.0.0.1:3000
- http://127.0.0.1:3001

### Banco de Dados
- **Host**: 193.203.175.55
- **Database**: u621081794_vamos
- **Tabela**: cardapio_images

### FTP
- **Host**: 195.35.41.247
- **Diretório**: /cardapio-agilizaiapp/
- **URL Base**: https://www.grupoideiaum.com.br/cardapio-agilizaiapp/

## 🧪 Testes

### Testar Conexão FTP
```bash
node scripts/test-ftp.js
```

### Testar API
```bash
curl http://localhost:5001/api/images/list
```

### Testar Upload
```bash
curl -X POST http://localhost:5001/api/images/upload \
  -F "image=@test-image.jpg" \
  -F "type=test"
```

## 🐛 Troubleshooting

### Erro: "Cannot connect to localhost:5001"
1. Verificar se o backend está rodando
2. Verificar se a porta 5001 está livre
3. Executar: `lsof -i :5001`

### Erro: "CORS policy"
1. Verificar se o NODE_ENV=development está definido
2. Verificar configuração CORS no config/development.js

### Erro: "Database connection failed"
1. Verificar credenciais no config/development.js
2. Verificar se o banco está acessível

## 📁 Estrutura de Arquivos

```
vamos-comemorar-api/
├── server.js                 # Servidor principal
├── start-dev.sh              # Script de desenvolvimento
├── config/
│   ├── development.js        # Configurações de desenvolvimento
│   └── production.js         # Configurações de produção
├── routes/
│   └── images.js            # API de imagens
└── scripts/
    └── test-ftp.js          # Teste de conexão FTP
```

## 🔄 Fluxo de Desenvolvimento

1. **Iniciar Backend**: `./start-dev.sh`
2. **Iniciar Frontend**: `npm run dev`
3. **Acessar**: http://localhost:3000/admin/cardapio
4. **Testar Upload**: Fazer upload de uma imagem
5. **Verificar**: Imagem deve aparecer no servidor FTP

## 📝 Logs

Os logs do servidor aparecem no terminal onde foi iniciado.
Para ver logs detalhados, adicione `console.log` no código. 
#!/bin/bash

echo "🚀 Iniciando deploy da API..."

# Criar diretório de logs se não existir
mkdir -p logs

# Instalar dependências
echo "📦 Instalando dependências..."
npm install

# Executar migração do banco
echo "🗄️ Executando migração do banco..."
node run_cardapio_migration.js

# Parar processo anterior se existir
echo "🛑 Parando processo anterior..."
pm2 stop vamos-comemorar-api 2>/dev/null || true
pm2 delete vamos-comemorar-api 2>/dev/null || true

# Iniciar com PM2
echo "▶️ Iniciando aplicação com PM2..."
pm2 start ecosystem.config.js --env production

# Salvar configuração do PM2
echo "💾 Salvando configuração do PM2..."
pm2 save

# Mostrar status
echo "📊 Status da aplicação:"
pm2 status

echo "✅ Deploy concluído!"
echo "🌐 API disponível em: https://www.grupoideiaum.com.br:5001"
echo "📝 Logs disponíveis em: pm2 logs vamos-comemorar-api" 
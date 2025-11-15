#!/bin/bash

# Script de Deploy para Produção
# Sistema de Reservas do Restaurante

echo "🚀 Iniciando deploy para produção..."

# Verificar se estamos no diretório correto
if [ ! -f "package.json" ]; then
    echo "❌ Erro: Execute este script no diretório raiz do projeto"
    exit 1
fi

# Instalar dependências
echo "📦 Instalando dependências..."
npm install --production

# Executar migrações do banco de dados
echo "🗄️ Verificando migrações do banco de dados..."
if [ -f "migrations/postgresql_triggers_and_functions.sql" ]; then
    echo "⚠️ Certifique-se de que executou manualmente: migrations/postgresql_triggers_and_functions.sql"
    echo "   Este arquivo contém triggers e funções necessárias para o PostgreSQL"
fi

# Verificar configurações
echo "⚙️ Verificando configurações..."
if [ ! -f ".env" ]; then
    echo "⚠️ Arquivo .env não encontrado. Copie config/production.env.example para .env"
fi

# Testar conexão com banco de dados
echo "🔍 Testando conexão com banco de dados..."
node -e "
const pool = require('./config/database');
pool.query('SELECT 1')
  .then(() => {
    console.log('✅ Conexão com banco de dados PostgreSQL OK');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Erro na conexão com banco de dados:', err.message);
    process.exit(1);
  });
"

# Iniciar servidor
echo "🎯 Iniciando servidor de produção..."
NODE_ENV=production node server.js














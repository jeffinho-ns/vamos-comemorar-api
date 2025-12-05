#!/bin/bash

# Script para testar autenticação Azure diretamente via curl
# Isso ajuda a identificar se o problema é com o secret ou com nosso código

echo "🔍 Testando Autenticação Azure Diretamente"
echo "============================================================"

# Carrega variáveis do .env
source .env 2>/dev/null || {
    echo "❌ Arquivo .env não encontrado"
    exit 1
}

CLIENT_ID="${MS_CLIENT_ID}"
TENANT_ID="${MS_TENANT_ID}"
CLIENT_SECRET="${MS_CLIENT_SECRET}"

if [ -z "$CLIENT_ID" ] || [ -z "$TENANT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
    echo "❌ Variáveis de ambiente não configuradas"
    exit 1
fi

echo "📋 Configurações:"
echo "   Client ID: $CLIENT_ID"
echo "   Tenant ID: $TENANT_ID"
echo "   Secret Preview: ${CLIENT_SECRET:0:10}...${CLIENT_SECRET: -5}"
echo ""

TOKEN_ENDPOINT="https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token"

echo "📤 Enviando requisição de autenticação..."
echo "   Endpoint: $TOKEN_ENDPOINT"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$TOKEN_ENDPOINT" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=${CLIENT_ID}" \
  -d "scope=https://graph.microsoft.com/.default" \
  -d "client_secret=${CLIENT_SECRET}" \
  -d "grant_type=client_credentials")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "📥 Resposta:"
echo "   Status HTTP: $HTTP_CODE"
echo "   Body: $BODY"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Autenticação bem-sucedida!"
    ACCESS_TOKEN=$(echo "$BODY" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
    if [ ! -z "$ACCESS_TOKEN" ]; then
        echo "   Token obtido: ${ACCESS_TOKEN:0:20}..."
        echo ""
        echo "✅ O secret está funcionando corretamente!"
        echo "   O problema pode estar no código Node.js ou na propagação."
    fi
else
    echo "❌ Erro na autenticação"
    echo ""
    echo "💡 Possíveis causas:"
    echo "   1. Secret expirado ou inválido"
    echo "   2. Client ID incorreto"
    echo "   3. Permissões não configuradas"
    echo "   4. App Registration com problema"
fi





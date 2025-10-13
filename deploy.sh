#!/bin/bash

echo "🚀 Iniciando deploy do sistema de reservas..."

# Verificar se estamos no diretório correto
if [ ! -f "package.json" ]; then
    echo "❌ Erro: Execute este script no diretório vamos-comemorar-api"
    exit 1
fi

# Verificar se há mudanças não commitadas
if [ -n "$(git status --porcelain)" ]; then
    echo "📝 Há mudanças não commitadas. Fazendo commit..."
    git add .
    git commit -m "fix: Correções finais - autenticação e filtros de guest lists"
else
    echo "✅ Nenhuma mudança para commit"
fi

# Push para o repositório
echo "📤 Fazendo push para o repositório..."
git push origin main

# Verificar status do deploy
echo "⏳ Aguardando deploy no Render..."
echo "🔍 Verifique o status em: https://dashboard.render.com"

# Teste básico da API
echo "🧪 Testando API após deploy..."
sleep 30

API_URL="https://vamos-comemorar-api.onrender.com"
HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health")

if [ "$HEALTH_CHECK" = "200" ]; then
    echo "✅ API está funcionando (Status: $HEALTH_CHECK)"
else
    echo "⚠️ API pode estar com problemas (Status: $HEALTH_CHECK)"
fi

echo "🎉 Deploy concluído!"
echo "📋 Próximos passos:"
echo "   1. Verificar logs no Render"
echo "   2. Testar funcionalidades no frontend"
echo "   3. Verificar se reservas grandes aparecem no calendário"
echo "   4. Testar filtro de mês nas listas de convidados"

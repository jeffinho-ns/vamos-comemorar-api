#!/bin/bash

# ========================================
# Script de Migração - Módulo de Eventos
# Executa automaticamente os scripts SQL
# ========================================

echo "🚀 INICIANDO MIGRAÇÃO DO MÓDULO DE EVENTOS"
echo "=========================================="
echo ""

# Configurações do banco
DB_HOST="193.203.175.55"
DB_USER="u621081794_vamos"
DB_NAME="u621081794_vamos"

# Solicitar senha
echo "Digite a senha do banco de dados:"
read -s DB_PASS
echo ""

# Função para executar SQL
execute_sql() {
    local script_name=$1
    local script_path=$2
    
    echo "📝 Executando: $script_name"
    mysql -h $DB_HOST -u $DB_USER -p$DB_PASS $DB_NAME < "$script_path"
    
    if [ $? -eq 0 ]; then
        echo "✅ $script_name executado com sucesso!"
    else
        echo "❌ Erro ao executar $script_name"
        exit 1
    fi
    echo ""
}

# Verificar se os scripts existem
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

if [ ! -f "$SCRIPT_DIR/eventos-listas-module-v2.sql" ]; then
    echo "❌ Erro: eventos-listas-module-v2.sql não encontrado"
    exit 1
fi

# Perguntar se deve executar rollback
echo "⚠️  Você já executou a versão 1 (eventos-listas-module.sql) anteriormente?"
echo "Digite 's' para SIM ou 'n' para NÃO:"
read -r resposta

if [[ "$resposta" == "s" || "$resposta" == "S" ]]; then
    echo ""
    echo "Executando rollback da V1..."
    execute_sql "Rollback V1" "$SCRIPT_DIR/rollback-eventos-listas-v1.sql"
fi

# Executar script principal V2
echo "Executando script principal V2..."
execute_sql "Módulo de Eventos V2" "$SCRIPT_DIR/eventos-listas-module-v2.sql"

# Habilitar eventos existentes
echo "Habilitando eventos existentes..."
execute_sql "Habilitar Eventos" "$SCRIPT_DIR/habilitar-eventos-existentes.sql"

# Executar testes
echo "Executando testes de validação..."
execute_sql "Teste Rápido" "$SCRIPT_DIR/teste-rapido.sql"

echo ""
echo "=========================================="
echo "🎉 MIGRAÇÃO CONCLUÍDA COM SUCESSO!"
echo "=========================================="
echo ""
echo "✅ Próximos passos:"
echo "1. Fazer deploy do backend (git push)"
echo "2. Fazer deploy do frontend (git push)"
echo "3. Acessar /admin/eventos/dashboard"
echo ""
echo "📚 Documentação:"
echo "- GUIA_CONFIGURACAO_INICIAL_EVENTOS.md"
echo "- SOLUCAO_COMPLETA_EVENTOS_LISTAS.md"
echo ""







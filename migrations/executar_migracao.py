#!/usr/bin/env python3
"""
Script de Migração - Módulo de Eventos e Listas
Executa automaticamente os scripts SQL no banco de dados
"""

import mysql.connector
import os
import sys

# Configurações do banco
DB_CONFIG = {
    'host': '193.203.175.55',
    'user': 'u621081794_vamos',
    'password': '@123Mudar!@',
    'database': 'u621081794_vamos',
    'charset': 'utf8mb4'
}

def print_header(texto):
    print("\n" + "=" * 60)
    print(f"  {texto}")
    print("=" * 60 + "\n")

def execute_sql_file(cursor, filepath, nome):
    """Executa um arquivo SQL"""
    print(f"📝 Executando: {nome}")
    
    try:
        with open(filepath, 'r', encoding='utf-8') as file:
            sql_script = file.read()
        
        # Dividir em statements (separados por ;)
        statements = [stmt.strip() for stmt in sql_script.split(';') if stmt.strip()]
        
        for i, statement in enumerate(statements, 1):
            # Ignorar comentários e linhas vazias
            if statement.startswith('--') or statement.startswith('/*') or not statement:
                continue
            
            try:
                cursor.execute(statement)
                if i % 10 == 0:
                    print(f"   ... processando ({i}/{len(statements)} statements)")
            except mysql.connector.Error as err:
                # Ignorar erros de "já existe" que são normais
                if 'already exists' in str(err) or 'Duplicate' in str(err):
                    continue
                print(f"   ⚠️ Aviso: {err}")
        
        print(f"✅ {nome} executado com sucesso!\n")
        return True
        
    except Exception as e:
        print(f"❌ Erro ao executar {nome}: {e}\n")
        return False

def main():
    print_header("🚀 MIGRAÇÃO - MÓDULO DE EVENTOS E LISTAS")
    
    # Diretório dos scripts
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    scripts = [
        ('eventos-listas-module-v2.sql', 'Script Principal V2'),
        ('habilitar-eventos-existentes.sql', 'Habilitar Eventos Existentes'),
        ('teste-rapido.sql', 'Teste de Validação')
    ]
    
    try:
        # Conectar ao banco
        print("🔌 Conectando ao banco de dados...")
        connection = mysql.connector.connect(**DB_CONFIG)
        cursor = connection.cursor()
        print("✅ Conectado com sucesso!\n")
        
        # Executar cada script
        for filename, nome in scripts:
            filepath = os.path.join(script_dir, filename)
            
            if not os.path.exists(filepath):
                print(f"⚠️ Arquivo não encontrado: {filepath}")
                continue
            
            if not execute_sql_file(cursor, filepath, nome):
                print(f"❌ Falha ao executar {nome}")
                sys.exit(1)
            
            # Commit após cada script
            connection.commit()
        
        # Verificações finais
        print_header("📊 VERIFICAÇÕES FINAIS")
        
        # Contar tabelas criadas
        cursor.execute("""
            SELECT COUNT(*) as total
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = 'u621081794_vamos'
            AND TABLE_NAME IN ('promoters', 'listas', 'listas_convidados', 
                              'beneficios', 'lista_convidado_beneficio', 'hostess')
        """)
        tabelas = cursor.fetchone()[0]
        print(f"📦 Tabelas criadas: {tabelas}/6 {'✅' if tabelas >= 6 else '❌'}")
        
        # Contar eventos habilitados
        cursor.execute("""
            SELECT COUNT(*) as total
            FROM eventos
            WHERE usado_para_listas = TRUE
        """)
        eventos = cursor.fetchone()[0]
        print(f"📅 Eventos habilitados: {eventos} {'✅' if eventos > 0 else '⚠️'}")
        
        # Contar promoters
        cursor.execute("SELECT COUNT(*) FROM promoters")
        promoters = cursor.fetchone()[0]
        print(f"👥 Promoters cadastrados: {promoters} {'✅' if promoters >= 4 else '⚠️'}")
        
        # Contar benefícios
        cursor.execute("SELECT COUNT(*) FROM beneficios")
        beneficios = cursor.fetchone()[0]
        print(f"🎁 Benefícios cadastrados: {beneficios} {'✅' if beneficios >= 6 else '⚠️'}")
        
        print_header("🎉 MIGRAÇÃO CONCLUÍDA COM SUCESSO!")
        
        print("✅ Próximos passos:")
        print("1. Deploy do backend: cd vamos-comemorar-api && git push")
        print("2. Deploy do frontend: cd vamos-comemorar-next && git push")
        print("3. Acessar: /admin/eventos/dashboard")
        print("\n📚 Documentação: GUIA_CONFIGURACAO_INICIAL_EVENTOS.md\n")
        
    except mysql.connector.Error as err:
        print(f"\n❌ Erro de conexão: {err}")
        print("\nVerifique:")
        print("- Host: 193.203.175.55")
        print("- User: u621081794_vamos")
        print("- Password: @123Mudar!@")
        print("- Database: u621081794_vamos")
        sys.exit(1)
        
    except Exception as e:
        print(f"\n❌ Erro inesperado: {e}")
        sys.exit(1)
        
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'connection' in locals():
            connection.close()
            print("🔌 Conexão fechada.\n")

if __name__ == "__main__":
    main()




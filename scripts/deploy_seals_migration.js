const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Configuração do banco de dados de produção
const dbConfig = {
    host: process.env.DB_HOST || 'sql10.freemysqlhosting.net',
    user: process.env.DB_USER || 'u621081794_vamos',
    password: process.env.DB_PASSWORD || 'vamos123',
    database: process.env.DB_NAME || 'u621081794_vamos',
    charset: 'utf8mb4'
};

async function deploySealsMigration() {
    let connection;
    
    try {
        console.log('🚀 Iniciando deploy da migração de selos...');
        console.log('🔗 Conectando ao banco de dados de produção...');
        
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Conectado ao banco de dados de produção');

        // Verificar se o campo já existe
        console.log('🔍 Verificando se o campo seals já existe...');
        const [existingColumns] = await connection.execute(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'seals'"
        );
        
        if (existingColumns.length > 0) {
            console.log('✅ Campo "seals" já existe na tabela menu_items');
            console.log('🎯 Migração não é necessária');
            return;
        }

        console.log('📋 Campo "seals" não encontrado, executando migração...');
        
        // Ler o arquivo de migração
        const migrationPath = path.join(__dirname, '..', 'migrations', 'add_seals_to_menu_items.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        // Dividir o SQL em comandos individuais
        const commands = migrationSQL
            .split(';')
            .map(cmd => cmd.trim())
            .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));

        for (const command of commands) {
            if (command.trim()) {
                console.log(`⚡ Executando: ${command.substring(0, 50)}...`);
                await connection.execute(command);
            }
        }

        console.log('✅ Migração executada com sucesso!');
        console.log('🎉 Campo "seals" adicionado à tabela menu_items');
        console.log('🚀 Sistema de selos agora está ativo em produção!');

        // Verificar se a migração foi bem-sucedida
        console.log('🔍 Verificando migração...');
        const [newColumns] = await connection.execute(
            "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'seals'"
        );
        
        if (newColumns.length > 0) {
            console.log('✅ Campo "seals" confirmado na tabela:');
            console.log(`   Tipo: ${newColumns[0].DATA_TYPE}`);
            console.log(`   Nullable: ${newColumns[0].IS_NULLABLE}`);
        } else {
            console.log('❌ Erro: Campo "seals" não foi criado');
            process.exit(1);
        }

    } catch (error) {
        console.error('❌ Erro durante o deploy da migração:', error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            console.log('🔌 Conexão com banco de dados encerrada');
        }
    }
}

// Executar migração se o script for chamado diretamente
if (require.main === module) {
    deploySealsMigration();
}

module.exports = deploySealsMigration;
























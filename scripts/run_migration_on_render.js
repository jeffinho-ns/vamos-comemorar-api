const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Configuração do banco de dados usando variáveis de ambiente do Render
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4'
};

async function runMigrationOnRender() {
    let connection;
    
    try {
        console.log('🚀 Executando migração de selos no Render...');
        console.log('🔗 Conectando ao banco de dados...');
        
        // Verificar se as variáveis de ambiente estão definidas
        if (!dbConfig.host || !dbConfig.user || !dbConfig.password || !dbConfig.database) {
            console.error('❌ Variáveis de ambiente do banco de dados não configuradas');
            console.log('Variáveis necessárias: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
            process.exit(1);
        }
        
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Conectado ao banco de dados');

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
        
        // Executar comandos de migração diretamente
        const migrationCommands = [
            "ALTER TABLE `menu_items` ADD COLUMN `seals` JSON DEFAULT NULL COMMENT 'Array de IDs dos selos selecionados para o item' AFTER `subCategory`",
            "CREATE INDEX `idx_menu_items_seals` ON `menu_items` ((CAST(`seals` AS CHAR(255) ARRAY)))",
            "ALTER TABLE `menu_items` COMMENT = 'Tabela de itens do cardápio com suporte a selos de identificação'"
        ];

        for (const command of migrationCommands) {
            console.log(`⚡ Executando: ${command.substring(0, 50)}...`);
            await connection.execute(command);
        }

        console.log('✅ Migração executada com sucesso!');
        console.log('🎉 Campo "seals" adicionado à tabela menu_items');
        console.log('🚀 Sistema de selos agora está ativo!');

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
        console.error('❌ Erro durante a migração:', error);
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
    runMigrationOnRender();
}

module.exports = runMigrationOnRender;


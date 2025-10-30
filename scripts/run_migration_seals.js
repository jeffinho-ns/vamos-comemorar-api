const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Configuração do banco de dados
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'u621081794_vamos',
    charset: 'utf8mb4'
};

async function runMigration() {
    let connection;
    
    try {
        console.log('🔄 Conectando ao banco de dados...');
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Conectado ao banco de dados');

        // Ler o arquivo de migração
        const migrationPath = path.join(__dirname, '..', 'migrations', 'add_seals_to_menu_items.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        console.log('🔄 Executando migração para adicionar campo seals...');
        
        // Dividir o SQL em comandos individuais
        const commands = migrationSQL
            .split(';')
            .map(cmd => cmd.trim())
            .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));

        for (const command of commands) {
            if (command.trim()) {
                console.log(`Executando: ${command.substring(0, 50)}...`);
                await connection.execute(command);
            }
        }

        console.log('✅ Migração executada com sucesso!');
        console.log('📋 Campo "seals" adicionado à tabela menu_items');
        console.log('🎯 Os selos agora podem ser salvos e recuperados do banco de dados');

    } catch (error) {
        console.error('❌ Erro ao executar migração:', error);
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
    runMigration();
}

module.exports = runMigration;


























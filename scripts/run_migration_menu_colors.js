const mysql = require('mysql2/promise');
require('dotenv').config();

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
        console.log('🔌 Conectando ao banco de dados...');
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Conectado ao banco de dados');
        
        // Verificar se os campos já existem
        console.log('🔍 Verificando se os campos já existem...');
        const [columns] = await connection.execute(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'bars' AND COLUMN_NAME IN ('menu_category_bg_color', 'menu_category_text_color', 'menu_subcategory_bg_color', 'menu_subcategory_text_color', 'mobile_sidebar_bg_color', 'mobile_sidebar_text_color', 'custom_seals', 'menu_display_style')"
        );
        
        if (columns.length > 0) {
            console.log('⚠️  Alguns campos já existem na tabela bars');
            console.log(`   Campos encontrados: ${columns.map(c => c.COLUMN_NAME).join(', ')}`);
            console.log('✅ Migração já foi executada anteriormente');
            return;
        }
        
        console.log('📋 Campos não encontrados, executando migração...');
        
        // Ler o arquivo de migração
        const fs = require('fs');
        const path = require('path');
        const migrationPath = path.join(__dirname, '../migrations/add_menu_colors_to_bars.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        // Dividir em comandos SQL separados
        const commands = migrationSQL
            .split(';')
            .map(cmd => cmd.trim())
            .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));
        
        // Executar cada comando
        for (const command of commands) {
            if (command.trim()) {
                console.log(`⚡ Executando: ${command.substring(0, 100)}...`);
                await connection.execute(command);
            }
        }
        
        console.log('✅ Migração executada com sucesso!');
        console.log('🎉 Campos de personalização de cores adicionados à tabela bars');
        
        // Verificar se a migração foi bem-sucedida
        console.log('🔍 Verificando migração...');
        const [newColumns] = await connection.execute(
            "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_COMMENT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'bars' AND COLUMN_NAME IN ('menu_category_bg_color', 'menu_category_text_color', 'menu_subcategory_bg_color', 'menu_subcategory_text_color', 'mobile_sidebar_bg_color', 'mobile_sidebar_text_color', 'custom_seals', 'menu_display_style')"
        );
        
        if (newColumns.length > 0) {
            console.log('✅ Migração confirmada:');
            newColumns.forEach(col => {
                console.log(`   - ${col.COLUMN_NAME}: ${col.DATA_TYPE} (${col.IS_NULLABLE === 'YES' ? 'nullable' : 'not null'})`);
                if (col.COLUMN_COMMENT) {
                    console.log(`     ${col.COLUMN_COMMENT}`);
                }
            });
        } else {
            console.log('❌ Erro: Campos não foram criados');
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
    runMigration()
        .then(() => {
            console.log('🚀 Migração concluída com sucesso!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Falha na migração:', error);
            process.exit(1);
        });
}

module.exports = { runMigration };


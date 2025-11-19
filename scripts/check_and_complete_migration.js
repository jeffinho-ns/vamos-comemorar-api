const mysql = require('mysql2/promise');

const dbConfig = {
    host: '193.203.175.55',
    user: 'u621081794_vamos',
    password: '@123Mudar!@',
    database: 'u621081794_vamos',
    charset: 'utf8mb4'
};

async function checkAndCompleteMigration() {
    let connection;
    
    try {
        console.log('🔌 Conectando ao banco de dados...');
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Conectado ao banco de dados');
        
        // Verificar quais campos existem
        const [columns] = await connection.execute(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'bars' AND COLUMN_NAME IN ('menu_category_bg_color', 'menu_category_text_color', 'menu_subcategory_bg_color', 'menu_subcategory_text_color', 'mobile_sidebar_bg_color', 'mobile_sidebar_text_color', 'custom_seals', 'menu_display_style')"
        );
        
        const existingColumns = columns.map(c => c.COLUMN_NAME);
        console.log('📋 Campos existentes:', existingColumns);
        
        const allColumns = [
            'menu_category_bg_color',
            'menu_category_text_color',
            'menu_subcategory_bg_color',
            'menu_subcategory_text_color',
            'mobile_sidebar_bg_color',
            'mobile_sidebar_text_color',
            'custom_seals',
            'menu_display_style'
        ];
        
        const missingColumns = allColumns.filter(col => !existingColumns.includes(col));
        console.log('📋 Campos faltando:', missingColumns);
        
        if (missingColumns.length === 0) {
            console.log('✅ Todos os campos já existem!');
            return;
        }
        
        // Criar comandos SQL para campos faltantes
        const commands = [];
        
        if (missingColumns.includes('menu_category_bg_color')) {
            commands.push("ALTER TABLE `bars` ADD COLUMN `menu_category_bg_color` VARCHAR(7) DEFAULT NULL COMMENT 'Cor de fundo das categorias no formato hexadecimal (#RRGGBB)'");
        }
        if (missingColumns.includes('menu_category_text_color')) {
            // Já existe, não precisa
        }
        if (missingColumns.includes('menu_subcategory_bg_color')) {
            commands.push("ALTER TABLE `bars` ADD COLUMN `menu_subcategory_bg_color` VARCHAR(7) DEFAULT NULL COMMENT 'Cor de fundo das subcategorias no formato hexadecimal (#RRGGBB)'");
        }
        if (missingColumns.includes('menu_subcategory_text_color')) {
            // Já existe, não precisa
        }
        if (missingColumns.includes('mobile_sidebar_bg_color')) {
            commands.push("ALTER TABLE `bars` ADD COLUMN `mobile_sidebar_bg_color` VARCHAR(7) DEFAULT NULL COMMENT 'Cor de fundo do sidebar mobile no formato hexadecimal (#RRGGBB)'");
        }
        if (missingColumns.includes('mobile_sidebar_text_color')) {
            // Já existe, não precisa
        }
        if (missingColumns.includes('custom_seals')) {
            commands.push("ALTER TABLE `bars` ADD COLUMN `custom_seals` JSON DEFAULT NULL COMMENT 'Array JSON com selos customizados e suas cores: [{\"id\": \"string\", \"name\": \"string\", \"color\": \"#hex\", \"type\": \"food|drink\"}, ...]'");
        }
        if (missingColumns.includes('menu_display_style')) {
            commands.push("ALTER TABLE `bars` ADD COLUMN `menu_display_style` VARCHAR(20) NOT NULL DEFAULT 'normal' COMMENT 'Define o estilo do cardápio: normal ou clean'");
        }
        
        // Executar comandos
        for (const command of commands) {
            console.log(`⚡ Executando: ${command.substring(0, 80)}...`);
            await connection.execute(command);
        }
        
        console.log('✅ Migração completada!');
        
        // Verificar novamente
        const [newColumns] = await connection.execute(
            "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'bars' AND COLUMN_NAME IN ('menu_category_bg_color', 'menu_category_text_color', 'menu_subcategory_bg_color', 'menu_subcategory_text_color', 'mobile_sidebar_bg_color', 'mobile_sidebar_text_color', 'custom_seals', 'menu_display_style')"
        );
        
        console.log('✅ Campos finais:');
        newColumns.forEach(col => {
            console.log(`   - ${col.COLUMN_NAME}: ${col.DATA_TYPE}`);
        });
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
        if (error.message.includes('Duplicate column name')) {
            console.log('⚠️  Alguns campos já existem, continuando...');
        } else {
            throw error;
        }
    } finally {
        if (connection) {
            await connection.end();
            console.log('🔌 Conexão encerrada');
        }
    }
}

checkAndCompleteMigration()
    .then(() => {
        console.log('🚀 Processo concluído!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Falha:', error);
        process.exit(1);
    });



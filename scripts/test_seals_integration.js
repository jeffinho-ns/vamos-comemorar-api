const mysql = require('mysql2/promise');
const fetch = require('node-fetch');

// Configuração do banco de dados
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'u621081794_vamos',
    charset: 'utf8mb4'
};

const API_BASE_URL = 'https://vamos-comemorar-api.onrender.com/api/cardapio';

async function testSealsIntegration() {
    let connection;
    
    try {
        console.log('🧪 Testando integração do sistema de selos...\n');

        // 1. Testar se o campo seals existe na tabela
        console.log('1️⃣ Verificando estrutura da tabela menu_items...');
        connection = await mysql.createConnection(dbConfig);
        
        const [columns] = await connection.execute(
            "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'seals'"
        );
        
        if (columns.length > 0) {
            console.log('✅ Campo "seals" encontrado na tabela menu_items');
            console.log(`   Tipo: ${columns[0].DATA_TYPE}`);
            console.log(`   Nullable: ${columns[0].IS_NULLABLE}`);
            console.log(`   Default: ${columns[0].COLUMN_DEFAULT || 'NULL'}`);
        } else {
            console.log('❌ Campo "seals" não encontrado na tabela menu_items');
            console.log('   Execute a migração primeiro: node scripts/run_migration_seals.js');
            return;
        }

        // 2. Testar inserção de item com selos
        console.log('\n2️⃣ Testando inserção de item com selos...');
        
        const testItem = {
            name: 'Teste Selos - Pizza Margherita',
            description: 'Pizza artesanal com molho de tomate, mussarela e manjericão',
            price: 45.90,
            imageUrl: 'test-pizza.jpg',
            categoryId: 1, // Assumindo que existe uma categoria com ID 1
            barId: 1, // Assumindo que existe um bar com ID 1
            subCategory: 'Pizzas',
            order: 1,
            seals: ['artesanal', 'vegetariano', 'prato-da-casa'],
            toppings: []
        };

        try {
            const response = await fetch(`${API_BASE_URL}/items`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(testItem)
            });

            if (response.ok) {
                const result = await response.json();
                console.log('✅ Item criado com sucesso via API');
                console.log(`   ID: ${result.id}`);
                console.log(`   Selos: ${JSON.stringify(result.seals)}`);

                // 3. Testar recuperação do item
                console.log('\n3️⃣ Testando recuperação do item...');
                
                const getResponse = await fetch(`${API_BASE_URL}/items/${result.id}`);
                if (getResponse.ok) {
                    const retrievedItem = await getResponse.json();
                    console.log('✅ Item recuperado com sucesso via API');
                    console.log(`   Nome: ${retrievedItem.name}`);
                    console.log(`   Selos: ${JSON.stringify(retrievedItem.seals)}`);
                    
                    // Verificar se os selos foram salvos corretamente
                    if (Array.isArray(retrievedItem.seals) && retrievedItem.seals.length === 3) {
                        console.log('✅ Selos foram salvos e recuperados corretamente');
                    } else {
                        console.log('❌ Problema na recuperação dos selos');
                    }
                } else {
                    console.log('❌ Erro ao recuperar item via API');
                }

                // 4. Limpar item de teste
                console.log('\n4️⃣ Limpando item de teste...');
                const deleteResponse = await fetch(`${API_BASE_URL}/items/${result.id}`, {
                    method: 'DELETE'
                });
                
                if (deleteResponse.ok) {
                    console.log('✅ Item de teste removido');
                } else {
                    console.log('⚠️  Item de teste não foi removido (pode ser removido manualmente)');
                }

            } else {
                console.log('❌ Erro ao criar item via API');
                const error = await response.text();
                console.log(`   Erro: ${error}`);
            }

        } catch (apiError) {
            console.log('❌ Erro na comunicação com API');
            console.log(`   Erro: ${apiError.message}`);
        }

        // 5. Testar consulta direta no banco
        console.log('\n5️⃣ Testando consulta direta no banco...');
        
        const [items] = await connection.execute(
            'SELECT id, name, seals FROM menu_items WHERE seals IS NOT NULL LIMIT 5'
        );
        
        if (items.length > 0) {
            console.log('✅ Itens com selos encontrados no banco:');
            items.forEach(item => {
                const seals = item.seals ? JSON.parse(item.seals) : [];
                console.log(`   ID ${item.id}: ${item.name} - Selos: ${JSON.stringify(seals)}`);
            });
        } else {
            console.log('ℹ️  Nenhum item com selos encontrado no banco');
        }

        console.log('\n🎉 Teste de integração concluído!');

    } catch (error) {
        console.error('❌ Erro durante o teste:', error);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// Executar teste se o script for chamado diretamente
if (require.main === module) {
    testSealsIntegration();
}

module.exports = testSealsIntegration;

















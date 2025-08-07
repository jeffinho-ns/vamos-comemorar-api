const mysql = require('mysql2/promise');

async function checkSchema() {
  let connection;
  
  try {
    // Conectar ao banco de produção
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'vamos_comemorar'
    });

    console.log('Conectado ao banco de dados');

    // Verificar estrutura da tabela bars
    console.log('\n=== Estrutura da tabela bars ===');
    const [barsColumns] = await connection.execute('DESCRIBE bars');
    barsColumns.forEach(col => {
      console.log(`${col.Field}: ${col.Type} ${col.Null === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });

    // Verificar estrutura da tabela menu_categories
    console.log('\n=== Estrutura da tabela menu_categories ===');
    const [categoriesColumns] = await connection.execute('DESCRIBE menu_categories');
    categoriesColumns.forEach(col => {
      console.log(`${col.Field}: ${col.Type} ${col.Null === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });

    // Verificar estrutura da tabela menu_items
    console.log('\n=== Estrutura da tabela menu_items ===');
    const [itemsColumns] = await connection.execute('DESCRIBE menu_items');
    itemsColumns.forEach(col => {
      console.log(`${col.Field}: ${col.Type} ${col.Null === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });

    // Verificar alguns dados da tabela bars
    console.log('\n=== Dados da tabela bars ===');
    const [bars] = await connection.execute('SELECT id, name, slug FROM bars LIMIT 3');
    bars.forEach(bar => {
      console.log(`ID: ${bar.id}, Name: ${bar.name}, Slug: ${bar.slug}`);
    });

  } catch (error) {
    console.error('Erro ao verificar schema:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

checkSchema(); 
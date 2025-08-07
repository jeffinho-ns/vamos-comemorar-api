const mysql = require('mysql2/promise');

async function checkTableStructure() {
  const connection = await mysql.createConnection({
    host: '193.203.175.55',
    user: 'u621081794_vamos',
    password: '@123Mudar!@',
    database: 'u621081794_vamos'
  });

  try {
    console.log('Verificando estrutura da tabela bars...');
    const [rows] = await connection.execute('DESCRIBE bars');
    console.log('Estrutura da tabela bars:');
    console.table(rows);

    console.log('\nVerificando estrutura da tabela menu_categories...');
    const [categoriesRows] = await connection.execute('DESCRIBE menu_categories');
    console.log('Estrutura da tabela menu_categories:');
    console.table(categoriesRows);

    console.log('\nVerificando estrutura da tabela menu_items...');
    const [itemsRows] = await connection.execute('DESCRIBE menu_items');
    console.log('Estrutura da tabela menu_items:');
    console.table(itemsRows);

    console.log('\nVerificando estrutura da tabela toppings...');
    const [toppingsRows] = await connection.execute('DESCRIBE toppings');
    console.log('Estrutura da tabela toppings:');
    console.table(toppingsRows);

    console.log('\nVerificando estrutura da tabela item_toppings...');
    const [itemToppingsRows] = await connection.execute('DESCRIBE item_toppings');
    console.log('Estrutura da tabela item_toppings:');
    console.table(itemToppingsRows);

  } catch (error) {
    console.error('Erro ao verificar estrutura:', error);
  } finally {
    await connection.end();
  }
}

checkTableStructure(); 
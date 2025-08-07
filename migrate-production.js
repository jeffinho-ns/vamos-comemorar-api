const mysql = require('mysql2/promise');

// Dados mockados para migração
const bars = [
  {
    name: 'Seu Justino',
    slug: 'seujustino',
    description: 'Onde cada detalhe é pensado para proporcionar uma experiência inesquecível.',
    logo_url: '/images/logo-justino.png',
    cover_image_url: '/images/capa-justino.png',
    address: 'Rua Harmonia, 70 - Vila Madalena, São Paulo',
    rating: 4.5,
    reviews_count: 1200,
    latitude: -23.5572069,
    longitude: -46.6895775,
    amenities: JSON.stringify(['Wi-Fi', 'Acessível', 'Estacionamento', 'Fumódromo', 'Música ao vivo'])
  },
  {
    name: 'Oh Fregues',
    slug: 'ohfregues',
    description: 'Um lugar incrível para curtir com os amigos.',
    logo_url: '/images/logo-fregues.png',
    cover_image_url: '/images/capa-ohfregues.jpg',
    address: 'Rua das Flores, 123 - Centro, São Paulo',
    rating: 4.2,
    reviews_count: 850,
    latitude: -23.4974950,
    longitude: -46.7017800,
    amenities: JSON.stringify(['Samba ao vivo', 'Wi-Fi', 'Estacionamento'])
  },
  {
    name: 'High Line Bar',
    slug: 'highline',
    description: 'Um lugar perfeito para relaxar e curtir boa música ao vivo.',
    logo_url: '/images/logo-highline.png',
    cover_image_url: '/images/capa-highline.jpeg',
    address: 'Rua Girassol, 144 - Vila Madalena',
    rating: 4.8,
    reviews_count: 2500,
    latitude: -23.5605,
    longitude: -46.6903979,
    amenities: JSON.stringify(['Pet Friendly', 'Cervejas Artesanais', 'Wi-Fi'])
  },
  {
    name: 'Pracinha do Seu Justino',
    slug: 'pracinha',
    description: 'O melhor do samba e gastronomia em um só lugar.',
    logo_url: '/images/logo-pracinha.png',
    cover_image_url: '/images/capa-pracinha.jpg',
    address: 'Rua Harmonia, 144 - Vila Madalena, São Paulo',
    rating: 4.6,
    reviews_count: 1500,
    latitude: -23.5568850,
    longitude: -46.6897039,
    amenities: JSON.stringify(['Wi-Fi', 'Estacionamento', 'Música ao vivo', 'Terraço'])
  }
];

const categories = [
  { name: 'Lanches', bar_id: 1, order: 1 },
  { name: 'Acompanhamentos', bar_id: 1, order: 2 },
  { name: 'Pratos Principais', bar_id: 4, order: 1 },
  { name: 'Drinks', bar_id: 2, order: 1 },
  { name: 'Cervejas', bar_id: 3, order: 1 }
];

const items = [
  // Seu Justino - Lanches
  {
    name: 'X-Burger Clássico',
    description: 'Hambúrguer artesanal com queijo, alface, tomate e molho especial',
    price: 25.90,
    image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop',
    category_id: 1,
    bar_id: 1,
    order: 1
  },
  {
    name: 'X-Salada Premium',
    description: 'Hambúrguer com salada completa e molho da casa',
    price: 28.90,
    image_url: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=400&h=300&fit=crop',
    category_id: 1,
    bar_id: 1,
    order: 2
  },
  // Seu Justino - Acompanhamentos
  {
    name: 'Batata Frita',
    description: 'Porção de batatas fritas crocantes',
    price: 12.90,
    image_url: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400&h=300&fit=crop',
    category_id: 2,
    bar_id: 1,
    order: 1
  },
  {
    name: 'Onion Rings',
    description: 'Anéis de cebola empanados e crocantes',
    price: 15.90,
    image_url: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=400&h=300&fit=crop',
    category_id: 2,
    bar_id: 1,
    order: 2
  },
  // Pracinha - Pratos Principais
  {
    name: 'Feijoada Completa',
    description: 'Feijoada tradicional com todos os acompanhamentos',
    price: 35.90,
    image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=300&fit=crop',
    category_id: 3,
    bar_id: 4,
    order: 1
  },
  {
    name: 'Picanha na Brasa',
    description: 'Picanha grelhada na brasa com arroz e feijão',
    price: 42.90,
    image_url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400&h=300&fit=crop',
    category_id: 3,
    bar_id: 4,
    order: 2
  },
  // Oh Fregues - Drinks
  {
    name: 'Caipirinha',
    description: 'Caipirinha tradicional com limão, açúcar e cachaça',
    price: 18.90,
    image_url: 'https://images.unsplash.com/photo-1579959947564-22c6c0c8c4b8?w=400&h=300&fit=crop',
    category_id: 4,
    bar_id: 2,
    order: 1
  },
  {
    name: 'Moscow Mule',
    description: 'Drink refrescante com vodka, gengibre e limão',
    price: 22.90,
    image_url: 'https://images.unsplash.com/photo-1579959947564-22c6c0c8c4b8?w=400&h=300&fit=crop',
    category_id: 4,
    bar_id: 2,
    order: 2
  },
  {
    name: 'Gin Tônica',
    description: 'Gin premium com água tônica e limão',
    price: 24.90,
    image_url: 'https://images.unsplash.com/photo-1579959947564-22c6c0c8c4b8?w=400&h=300&fit=crop',
    category_id: 4,
    bar_id: 2,
    order: 3
  },
  // High Line - Cervejas
  {
    name: 'Chopp Artesanal',
    description: 'Chopp gelado da casa',
    price: 8.90,
    image_url: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=400&h=300&fit=crop',
    category_id: 5,
    bar_id: 3,
    order: 1
  },
  {
    name: 'Cerveja Heineken',
    description: 'Cerveja importada gelada',
    price: 12.90,
    image_url: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=400&h=300&fit=crop',
    category_id: 5,
    bar_id: 3,
    order: 2
  },
  {
    name: 'Cerveja Stella Artois',
    description: 'Cerveja belga premium',
    price: 14.90,
    image_url: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=400&h=300&fit=crop',
    category_id: 5,
    bar_id: 3,
    order: 3
  }
];

const toppings = [
  { name: 'Bacon', price: 3.50 },
  { name: 'Queijo Extra', price: 2.00 },
  { name: 'Queijo Ralado', price: 2.50 },
  { name: 'Molho Extra', price: 2.00 },
  { name: 'Farofa Extra', price: 2.00 },
  { name: 'Couve Extra', price: 1.50 },
  { name: 'Vinagrete', price: 1.50 },
  { name: 'Frutas Extras', price: 2.00 },
  { name: 'Gelo Extra', price: 1.00 },
  { name: 'Gengibre Extra', price: 2.00 },
  { name: 'Gin Extra', price: 5.00 },
  { name: 'Chopp Extra', price: 6.00 },
  { name: 'Cerveja Extra', price: 10.00 }
];

// Mapeamento de toppings por item (item_id -> array de topping_ids)
const itemToppings = {
  1: [1, 2], // X-Burger Clássico -> Bacon, Queijo Extra
  2: [1, 2], // X-Salada Premium -> Bacon, Queijo Extra
  3: [3, 1], // Batata Frita -> Queijo Ralado, Bacon
  4: [4], // Onion Rings -> Molho Extra
  5: [5, 6], // Feijoada Completa -> Farofa Extra, Couve Extra
  6: [5, 7], // Picanha na Brasa -> Farofa, Vinagrete
  7: [8, 9], // Caipirinha -> Frutas Extras, Gelo Extra
  8: [10], // Moscow Mule -> Gengibre Extra
  9: [11], // Gin Tônica -> Gin Extra
  10: [12], // Chopp Artesanal -> Chopp Extra
  11: [13], // Cerveja Heineken -> Cerveja Extra
  12: [13] // Cerveja Stella Artois -> Cerveja Extra
};

async function migrateData() {
  // Configuração do banco de dados de produção
  const connection = await mysql.createConnection({
    host: '193.203.175.55',
    user: 'u621081794_vamos',
    password: '@123Mudar!@',
    database: 'u621081794_vamos',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  try {
    console.log('Iniciando migração de dados para produção...');

    // Limpar dados existentes
    console.log('Limpando dados existentes...');
    await connection.execute('DELETE FROM item_toppings');
    await connection.execute('DELETE FROM toppings');
    await connection.execute('DELETE FROM menu_items');
    await connection.execute('DELETE FROM menu_categories');
    await connection.execute('DELETE FROM bars');

    // Inserir bars
    console.log('Inserindo estabelecimentos...');
    for (const bar of bars) {
      const [result] = await connection.execute(
        'INSERT INTO bars (name, slug, description, logoUrl, coverImageUrl, address, rating, reviewsCount, latitude, longitude, amenities) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [bar.name, bar.slug, bar.description, bar.logo_url, bar.cover_image_url, bar.address, bar.rating, bar.reviews_count, bar.latitude, bar.longitude, bar.amenities]
      );
      console.log(`Estabelecimento "${bar.name}" inserido com ID: ${result.insertId}`);
    }

    // Inserir categorias
    console.log('Inserindo categorias...');
    for (const category of categories) {
      const [result] = await connection.execute(
        'INSERT INTO menu_categories (name, barId, `order`) VALUES (?, ?, ?)',
        [category.name, category.bar_id, category.order]
      );
      console.log(`Categoria "${category.name}" inserida com ID: ${result.insertId}`);
    }

    // Inserir toppings
    console.log('Inserindo toppings...');
    const toppingIds = {};
    for (const topping of toppings) {
      const [result] = await connection.execute(
        'INSERT INTO toppings (name, price) VALUES (?, ?)',
        [topping.name, topping.price]
      );
      toppingIds[topping.name] = result.insertId;
      console.log(`Topping "${topping.name}" inserido com ID: ${result.insertId}`);
    }

    // Inserir itens
    console.log('Inserindo itens do menu...');
    for (const item of items) {
      const [result] = await connection.execute(
        'INSERT INTO menu_items (name, description, price, imageUrl, categoryId, barId, `order`) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [item.name, item.description, item.price, item.image_url, item.category_id, item.bar_id, item.order]
      );
      const itemId = result.insertId;
      console.log(`Item "${item.name}" inserido com ID: ${itemId}`);

      // Inserir relacionamentos item-topping
      if (itemToppings[itemId]) {
        for (const toppingName of itemToppings[itemId]) {
          const toppingId = toppingIds[toppings[toppingName - 1].name];
          if (toppingId) {
            await connection.execute(
              'INSERT INTO item_toppings (item_id, topping_id) VALUES (?, ?)',
              [itemId, toppingId]
            );
            console.log(`Relacionamento item-topping criado: Item ${itemId} -> Topping ${toppingId}`);
          }
        }
      }
    }

    console.log('Migração concluída com sucesso!');
    console.log(`\nResumo:`);
    console.log(`- ${bars.length} estabelecimentos inseridos`);
    console.log(`- ${categories.length} categorias inseridas`);
    console.log(`- ${items.length} itens inseridos`);
    console.log(`- ${toppings.length} toppings inseridos`);

  } catch (error) {
    console.error('Erro durante a migração:', error);
  } finally {
    await connection.end();
  }
}

// Executar migração
migrateData(); 
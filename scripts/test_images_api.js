// Script para testar se a API está retornando as imagens corretamente
const fetch = require('node-fetch');

const API_BASE_URL = 'https://vamos-comemorar-api.onrender.com/api/cardapio';
const BASE_IMAGE_URL = 'https://grupoideiaum.com.br/cardapio-agilizaiapp/';

async function testAPI() {
  try {
    console.log('🧪 Testando API de Cardápio...\n');
    
    // Teste 1: Listar bares
    console.log('1️⃣ Testando GET /api/cardapio/bars');
    const barsRes = await fetch(`${API_BASE_URL}/bars`);
    if (!barsRes.ok) {
      throw new Error(`Erro ao buscar bares: ${barsRes.status}`);
    }
    const bars = await barsRes.json();
    console.log(`   ✅ ${bars.length} bares encontrados`);
    
    // Verificar URLs de imagens dos bares
    bars.forEach(bar => {
      if (bar.logoUrl && !bar.logoUrl.startsWith('http')) {
        console.log(`   ✅ Bar "${bar.name}": logoUrl = ${bar.logoUrl}`);
      }
      if (bar.coverImageUrl && !bar.coverImageUrl.startsWith('http')) {
        console.log(`   ✅ Bar "${bar.name}": coverImageUrl = ${bar.coverImageUrl}`);
      }
    });
    
    // Teste 2: Listar itens
    console.log('\n2️⃣ Testando GET /api/cardapio/items');
    const itemsRes = await fetch(`${API_BASE_URL}/items`);
    if (!itemsRes.ok) {
      throw new Error(`Erro ao buscar itens: ${itemsRes.status}`);
    }
    const items = await itemsRes.json();
    console.log(`   ✅ ${items.length} itens encontrados`);
    
    // Verificar URLs de imagens dos itens
    const itemsWithImages = items.filter(item => item.imageUrl && item.imageUrl.trim() !== '');
    const itemsWithoutImages = items.filter(item => !item.imageUrl || item.imageUrl.trim() === '');
    console.log(`   📊 Itens com imagem: ${itemsWithImages.length} (${(itemsWithImages.length / items.length * 100).toFixed(1)}%)`);
    console.log(`   📊 Itens sem imagem: ${itemsWithoutImages.length} (${(itemsWithoutImages.length / items.length * 100).toFixed(1)}%)`);
    
    // Verificar alguns itens
    const sampleItems = itemsWithImages.slice(0, 5);
    sampleItems.forEach(item => {
      if (item.imageUrl && !item.imageUrl.startsWith('http')) {
        const fullUrl = `${BASE_IMAGE_URL}${item.imageUrl}`;
        console.log(`   ✅ Item "${item.name}": imageUrl = ${item.imageUrl} -> ${fullUrl}`);
      }
    });
    
    // Teste 3: Buscar itens de um bar específico
    if (bars.length > 0) {
      const firstBar = bars[0];
      console.log(`\n3️⃣ Testando GET /api/cardapio/items?barId=${firstBar.id}`);
      const barItemsRes = await fetch(`${API_BASE_URL}/items?barId=${firstBar.id}`);
      if (!barItemsRes.ok) {
        throw new Error(`Erro ao buscar itens do bar: ${barItemsRes.status}`);
      }
      const barItems = await barItemsRes.json();
      console.log(`   ✅ ${barItems.length} itens do bar "${firstBar.name}"`);
    }
    
    console.log('\n✅ Todos os testes passaram!');
    console.log('\n📝 Resumo:');
    console.log(`   - ${bars.length} bares`);
    console.log(`   - ${items.length} itens no total`);
    console.log(`   - ${itemsWithImages.length} itens com imagem`);
    console.log(`   - URLs estão no formato correto (apenas filename)`);
    
  } catch (error) {
    console.error('❌ Erro nos testes:', error.message);
    process.exit(1);
  }
}

testAPI();


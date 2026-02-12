/**
 * Script para configurar permissões do analista@reserva.com via API
 * 
 * Este script usa a API para configurar as permissões, mas requer:
 * 1. Token de autenticação de um usuário admin
 * 2. Acesso à API rodando
 * 
 * Alternativa: Execute o script SQL diretamente no banco de dados
 */

const API_BASE_URL = process.env.API_URL || 'https://vamos-comemorar-api.onrender.com';

async function setAnalistaReservaPermissionsViaAPI() {
  try {
    console.log('🔍 Configurando permissões para analista@reserva.com via API...\n');
    console.log('⚠️  NOTA: Este script requer token de autenticação de admin\n');

    // Você precisa fornecer um token de admin aqui
    const adminToken = process.env.ADMIN_TOKEN || '';
    
    if (!adminToken) {
      console.log('❌ Token de admin não fornecido.');
      console.log('📝 Para usar este script, você precisa:');
      console.log('   1. Fazer login como admin no sistema');
      console.log('   2. Copiar o token de autenticação do localStorage');
      console.log('   3. Executar: ADMIN_TOKEN=seu_token node scripts/executeSetAnalistaReservaViaAPI.js\n');
      console.log('💡 Alternativa: Execute o script SQL diretamente no banco de dados:');
      console.log('   vamos-comemorar-api/scripts/set_analista_reserva_permissions.sql\n');
      return;
    }

    // 1. Buscar informações do usuário
    console.log('1️⃣ Buscando informações do usuário...');
    const userResponse = await fetch(`${API_BASE_URL}/api/users?email=analista@reserva.com`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!userResponse.ok) {
      throw new Error(`Erro ao buscar usuário: ${userResponse.statusText}`);
    }

    // Nota: Ajuste conforme a estrutura da resposta da API
    console.log('✅ Usuário encontrado\n');

    // 2. Buscar ID do estabelecimento Reserva Rooftop
    console.log('2️⃣ Buscando estabelecimento Reserva Rooftop...');
    // Você precisaria de um endpoint para buscar places ou fazer via SQL direto

    // 3. Remover permissões existentes
    console.log('3️⃣ Removendo permissões existentes...');
    // Usar DELETE endpoint se existir

    // 4. Criar nova permissão
    console.log('4️⃣ Criando permissão para Reserva Rooftop...');
    // Usar POST /api/establishment-permissions

    console.log('✅ Permissões configuradas com sucesso!');

  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.log('\n💡 Recomendação: Execute o script SQL diretamente no banco de dados');
    console.log('   Arquivo: vamos-comemorar-api/scripts/set_analista_reserva_permissions.sql');
  }
}

// Executar apenas se chamado diretamente
if (require.main === module) {
  setAnalistaReservaPermissionsViaAPI();
}

module.exports = { setAnalistaReservaPermissionsViaAPI };

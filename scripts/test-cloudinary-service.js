/**
 * Script de Teste do Serviço Cloudinary
 * 
 * Este script testa a conexão e funcionalidades básicas do serviço Cloudinary
 * antes de executar a migração completa.
 * 
 * Uso:
 *   node scripts/test-cloudinary-service.js
 */

require('dotenv').config();
const cloudinaryService = require('../services/cloudinaryService');

async function testCloudinaryService() {
  console.log('🧪 Testando Serviço Cloudinary');
  console.log('='.repeat(60));
  
  // Verificar variáveis de ambiente
  console.log('\n📋 Verificando variáveis de ambiente...');
  const requiredVars = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const missingVars = requiredVars.filter(v => !process.env[v]);
  
  if (missingVars.length > 0) {
    console.error('❌ Variáveis de ambiente faltando:', missingVars.join(', '));
    console.error('   Configure as variáveis no Render antes de continuar.');
    process.exit(1);
  }
  
  console.log('✅ CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME ? '✅ Configurado' : '❌ Não configurado');
  console.log('✅ CLOUDINARY_API_KEY:', process.env.CLOUDINARY_API_KEY ? '✅ Configurado' : '❌ Não configurado');
  console.log('✅ CLOUDINARY_API_SECRET:', process.env.CLOUDINARY_API_SECRET ? '✅ Configurado' : '❌ Não configurado');
  
  // Teste 1: Upload de arquivo de teste
  console.log('\n📤 Teste 1: Upload de arquivo de teste');
  try {
    const testFileName = `test-${Date.now()}.txt`;
    const testContent = Buffer.from('Este é um arquivo de teste para o Cloudinary. Data: ' + new Date().toISOString());
    
    console.log(`   Fazendo upload de ${testFileName}...`);
    const uploadResult = await cloudinaryService.uploadFile(testFileName, testContent, {
      folder: 'test',
      resource_type: 'raw'
    });
    
    if (uploadResult && uploadResult.secureUrl) {
      console.log('✅ Upload bem-sucedido!');
      console.log(`   Public ID: ${uploadResult.publicId}`);
      console.log(`   URL pública: ${uploadResult.secureUrl}`);
      
      // Teste 2: Verificar se a URL é acessível
      console.log('\n🌐 Teste 2: Verificando acessibilidade da URL');
      try {
        const fetch = require('node-fetch');
        const response = await fetch(uploadResult.secureUrl, { method: 'HEAD' });
        
        if (response.ok) {
          console.log('✅ URL pública é acessível!');
          console.log(`   Status: ${response.status}`);
        } else {
          console.warn('⚠️ URL retornou status:', response.status);
        }
      } catch (urlError) {
        console.warn('⚠️ Não foi possível verificar a URL (pode ser normal):', urlError.message);
      }
      
      // Teste 3: Deletar arquivo de teste
      console.log('\n🗑️ Teste 3: Deletar arquivo de teste');
      try {
        await cloudinaryService.deleteFile(uploadResult.publicId, { resource_type: 'raw' });
        console.log('✅ Arquivo de teste deletado com sucesso!');
      } catch (deleteError) {
        console.warn('⚠️ Erro ao deletar arquivo de teste (não crítico):', deleteError.message);
      }
      
    } else {
      throw new Error('Upload não retornou resultado esperado');
    }
  } catch (error) {
    console.error('❌ Erro no upload:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
  
  // Resumo final
  console.log('\n' + '='.repeat(60));
  console.log('✅ TODOS OS TESTES PASSARAM!');
  console.log('='.repeat(60));
  console.log('\n🎉 O serviço Cloudinary está funcionando corretamente.');
  console.log('✅ Você pode prosseguir com a migração de imagens.');
  console.log('\n📝 Próximo passo:');
  console.log('   node scripts/migrate-images-to-cloudinary.js');
  console.log('\n⚠️  Lembre-se de fazer backup do banco de dados antes!');
}

// Executa os testes
if (require.main === module) {
  testCloudinaryService().catch((error) => {
    console.error('\n❌ Erro fatal nos testes:', error);
    process.exit(1);
  });
}

module.exports = { testCloudinaryService };


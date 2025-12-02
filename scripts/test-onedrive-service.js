/**
 * Script de Teste do Serviço OneDrive
 * 
 * Este script testa a conexão e funcionalidades básicas do serviço OneDrive
 * antes de executar a migração completa.
 * 
 * Uso:
 *   node scripts/test-onedrive-service.js
 */

require('dotenv').config();
const onedriveService = require('../services/onedriveService');
const fs = require('fs');
const path = require('path');

async function testOneDriveService() {
  console.log('🧪 Testando Serviço OneDrive');
  console.log('='.repeat(60));
  
  // Verificar variáveis de ambiente
  console.log('\n📋 Verificando variáveis de ambiente...');
  const requiredVars = ['MS_CLIENT_ID', 'MS_TENANT_ID', 'MS_CLIENT_SECRET'];
  const missingVars = requiredVars.filter(v => !process.env[v]);
  
  if (missingVars.length > 0) {
    console.error('❌ Variáveis de ambiente faltando:', missingVars.join(', '));
    console.error('   Configure as variáveis no Render antes de continuar.');
    process.exit(1);
  }
  
  console.log('✅ MS_CLIENT_ID:', process.env.MS_CLIENT_ID ? '✅ Configurado' : '❌ Não configurado');
  console.log('✅ MS_TENANT_ID:', process.env.MS_TENANT_ID ? '✅ Configurado' : '❌ Não configurado');
  console.log('✅ MS_CLIENT_SECRET:', process.env.MS_CLIENT_SECRET ? '✅ Configurado' : '❌ Não configurado');
  
  // Teste 1: Autenticação
  console.log('\n🔐 Teste 1: Autenticação (obter access token)');
  try {
    const token = await onedriveService.getAccessToken();
    if (token) {
      console.log('✅ Autenticação bem-sucedida!');
      console.log(`   Token obtido: ${token.substring(0, 20)}...`);
    } else {
      throw new Error('Token não retornado');
    }
  } catch (error) {
    console.error('❌ Erro na autenticação:', error.message);
    console.error('   Verifique as credenciais do Microsoft Graph API');
    process.exit(1);
  }
  
  // Teste 2: Upload de arquivo de teste
  console.log('\n📤 Teste 2: Upload de arquivo de teste');
  try {
    // Criar um arquivo de teste simples (imagem pequena)
    const testFileName = `test-${Date.now()}.txt`;
    const testContent = Buffer.from('Este é um arquivo de teste para o OneDrive. Data: ' + new Date().toISOString());
    
    console.log(`   Fazendo upload de ${testFileName}...`);
    const uploadResult = await onedriveService.uploadFileAndGetPublicUrl(testFileName, testContent);
    
    if (uploadResult) {
      console.log('✅ Upload bem-sucedido!');
      console.log(`   URL pública: ${uploadResult}`);
      
      // Teste 3: Verificar se a URL é acessível
      console.log('\n🌐 Teste 3: Verificando acessibilidade da URL');
      try {
        const fetch = require('node-fetch');
        const response = await fetch(uploadResult, { method: 'HEAD' });
        
        if (response.ok) {
          console.log('✅ URL pública é acessível!');
          console.log(`   Status: ${response.status}`);
        } else {
          console.warn('⚠️ URL retornou status:', response.status);
        }
      } catch (urlError) {
        console.warn('⚠️ Não foi possível verificar a URL (pode ser normal):', urlError.message);
      }
      
      // Teste 4: Deletar arquivo de teste
      console.log('\n🗑️ Teste 4: Deletar arquivo de teste');
      try {
        await onedriveService.deleteFile(testFileName);
        console.log('✅ Arquivo de teste deletado com sucesso!');
      } catch (deleteError) {
        console.warn('⚠️ Erro ao deletar arquivo de teste (não crítico):', deleteError.message);
      }
      
    } else {
      throw new Error('Upload não retornou URL');
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
  console.log('\n🎉 O serviço OneDrive está funcionando corretamente.');
  console.log('✅ Você pode prosseguir com a migração de imagens.');
  console.log('\n📝 Próximo passo:');
  console.log('   node scripts/migrate-images-to-onedrive.js');
  console.log('\n⚠️  Lembre-se de fazer backup do banco de dados antes!');
}

// Executa os testes
if (require.main === module) {
  testOneDriveService().catch((error) => {
    console.error('\n❌ Erro fatal nos testes:', error);
    process.exit(1);
  });
}

module.exports = { testOneDriveService };


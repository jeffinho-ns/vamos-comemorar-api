/**
 * Script de Diagnóstico - Autenticação OneDrive
 * 
 * Este script ajuda a diagnosticar problemas de autenticação
 */

require('dotenv').config();
const fetch = require('node-fetch');

async function diagnoseAuth() {
  console.log('🔍 Diagnóstico de Autenticação OneDrive');
  console.log('='.repeat(60));
  
  const clientId = process.env.MS_CLIENT_ID;
  const tenantId = process.env.MS_TENANT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  
  console.log('\n📋 Variáveis de Ambiente:');
  console.log(`   MS_CLIENT_ID: ${clientId ? '✅ Configurado' : '❌ Não configurado'}`);
  console.log(`   MS_TENANT_ID: ${tenantId ? '✅ Configurado' : '❌ Não configurado'}`);
  console.log(`   MS_CLIENT_SECRET: ${clientSecret ? `✅ Configurado (${clientSecret.length} caracteres)` : '❌ Não configurado'}`);
  
  if (!clientId || !tenantId || !clientSecret) {
    console.error('\n❌ Variáveis de ambiente faltando!');
    process.exit(1);
  }
  
  console.log('\n🔐 Testando Autenticação...');
  console.log(`   Tenant: ${tenantId}`);
  console.log(`   Client ID: ${clientId}`);
  console.log(`   Secret Length: ${clientSecret.length} caracteres`);
  console.log(`   Secret Preview: ${clientSecret.substring(0, 10)}...${clientSecret.substring(clientSecret.length - 5)}`);
  
  const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  
  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('scope', 'https://graph.microsoft.com/.default');
  params.append('client_secret', clientSecret);
  params.append('grant_type', 'client_credentials');
  
  console.log('\n📤 Enviando requisição de autenticação...');
  console.log(`   Endpoint: ${tokenEndpoint}`);
  
  try {
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    
    const responseText = await response.text();
    console.log(`\n📥 Resposta do servidor:`);
    console.log(`   Status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      console.log(`   Body: ${responseText}`);
      
      try {
        const errorData = JSON.parse(responseText);
        console.log('\n❌ Erro detalhado:');
        console.log(`   Error: ${errorData.error}`);
        console.log(`   Description: ${errorData.error_description}`);
        
        if (errorData.error === 'invalid_client') {
          console.log('\n💡 Possíveis soluções:');
          console.log('   1. Verifique se o Client Secret foi copiado corretamente');
          console.log('   2. Confirme que o secret está ativo no Azure Portal');
          console.log('   3. Verifique se não há espaços extras no secret');
          console.log('   4. Aguarde alguns minutos após criar o secret (propagação)');
          console.log('   5. Verifique se o Client ID está correto');
        }
      } catch (e) {
        console.log(`   (Resposta não é JSON válido)`);
      }
      
      process.exit(1);
    }
    
    const data = JSON.parse(responseText);
    console.log('\n✅ Autenticação bem-sucedida!');
    console.log(`   Token Type: ${data.token_type}`);
    console.log(`   Expires In: ${data.expires_in} segundos`);
    console.log(`   Scope: ${data.scope}`);
    console.log(`   Access Token Preview: ${data.access_token.substring(0, 20)}...`);
    
  } catch (error) {
    console.error('\n❌ Erro na requisição:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  diagnoseAuth().catch((error) => {
    console.error('\n❌ Erro fatal:', error);
    process.exit(1);
  });
}

module.exports = { diagnoseAuth };





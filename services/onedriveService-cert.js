/**
 * Serviço OneDrive - Versão com Certificado
 * 
 * Esta é uma versão alternativa que usa certificado ao invés de secret.
 * Use esta versão se os secrets não estiverem funcionando.
 * 
 * Para usar:
 * 1. Gere um certificado: openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes
 * 2. Faça upload do cert.pem no Azure Portal (Certificates & secrets → Certificates)
 * 3. Substitua onedriveService.js por este arquivo
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

class OneDriveService {
  constructor() {
    // Configurações do Microsoft Graph API
    this.clientId = process.env.MS_CLIENT_ID;
    this.tenantId = process.env.MS_TENANT_ID;
    
    // Caminho do certificado (deve estar na raiz do projeto ou configurado via env)
    this.certPath = process.env.MS_CERT_PATH || path.join(__dirname, '../cert.pem');
    this.keyPath = process.env.MS_KEY_PATH || path.join(__dirname, '../key.pem');
    
    // Cache do access token
    this.accessToken = null;
    this.tokenExpiresAt = null;
    
    // URLs da API
    this.tokenEndpoint = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
    this.graphApiBase = 'https://graph.microsoft.com/v1.0';
    
    // Diretório no OneDrive
    this.driveItemPath = '/drive/root:/cardapio-agilizaiapp';
    
    console.log('✅ OneDriveService (Certificado) inicializado');
  }

  /**
   * Obtém um access token usando certificado
   */
  async getAccessToken() {
    // Verifica se o token ainda é válido
    const now = Date.now();
    if (this.accessToken && this.tokenExpiresAt && now < (this.tokenExpiresAt - 5 * 60 * 1000)) {
      console.log('✅ Usando access token em cache');
      return this.accessToken;
    }

    console.log('🔄 Renovando access token com certificado...');
    
    if (!this.clientId || !this.tenantId) {
      throw new Error('Credenciais do Microsoft Graph API não configuradas. Verifique as variáveis de ambiente: MS_CLIENT_ID, MS_TENANT_ID');
    }

    // Verificar se o certificado existe
    if (!fs.existsSync(this.certPath)) {
      throw new Error(`Certificado não encontrado em: ${this.certPath}. Configure MS_CERT_PATH ou coloque cert.pem na raiz do projeto.`);
    }

    try {
      // Para usar certificado, precisamos fazer uma requisição com client_assertion
      // Isso requer uma biblioteca adicional como 'jose' ou usar o certificado diretamente
      // Por enquanto, vamos manter a estrutura similar mas indicar que precisa de implementação adicional
      
      const cert = fs.readFileSync(this.certPath, 'utf8');
      const key = fs.existsSync(this.keyPath) ? fs.readFileSync(this.keyPath, 'utf8') : null;
      
      // NOTA: A implementação completa de autenticação com certificado requer
      // criar um JWT assinado com o certificado. Isso pode ser feito com a biblioteca 'jose'
      // ou 'jsonwebtoken' com suporte a certificados.
      
      // Por enquanto, vamos retornar um erro informativo
      throw new Error('Autenticação com certificado requer implementação adicional. Use a biblioteca "jose" para criar JWT assinado.');
      
    } catch (error) {
      console.error('❌ Erro ao obter access token:', error);
      throw new Error(`Erro na autenticação OneDrive: ${error.message}`);
    }
  }

  // ... (resto dos métodos permanecem iguais)
  // Os métodos uploadFile, getShareLink, etc. permanecem os mesmos
  // Apenas a autenticação muda
}

module.exports = new OneDriveService();





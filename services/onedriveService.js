/**
 * Serviço OneDrive - Microsoft Graph API
 * 
 * Este serviço gerencia a autenticação e operações de upload/download
 * de arquivos no Microsoft OneDrive usando a Graph API.
 * 
 * Funcionalidades:
 * - Autenticação via Client Credentials Grant (OAuth 2.0)
 * - Cache e renovação automática de access tokens
 * - Upload de arquivos para o OneDrive
 * - Geração de links públicos compartilháveis
 */

const fetch = require('node-fetch');

class OneDriveService {
  constructor() {
    // Configurações do Microsoft Graph API
    this.clientId = process.env.MS_CLIENT_ID;
    this.tenantId = process.env.MS_TENANT_ID;
    this.clientSecret = process.env.MS_CLIENT_SECRET;
    
    // Cache do access token
    this.accessToken = null;
    this.tokenExpiresAt = null;
    
    // URLs da API
    this.tokenEndpoint = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
    this.graphApiBase = 'https://graph.microsoft.com/v1.0';
    
    // Diretório no OneDrive onde as imagens serão armazenadas
    // Usando o drive root, mas pode ser ajustado para um diretório específico
    this.driveItemPath = '/drive/root:/cardapio-agilizaiapp';
    
    console.log('✅ OneDriveService inicializado');
  }

  /**
   * Obtém um access token válido usando Client Credentials Grant
   * Implementa cache e renovação automática antes da expiração
   * 
   * @returns {Promise<string>} Access token válido
   */
  async getAccessToken() {
    // Verifica se o token ainda é válido (renova 5 minutos antes de expirar)
    const now = Date.now();
    if (this.accessToken && this.tokenExpiresAt && now < (this.tokenExpiresAt - 5 * 60 * 1000)) {
      console.log('✅ Usando access token em cache');
      return this.accessToken;
    }

    console.log('🔄 Renovando access token...');
    
    if (!this.clientId || !this.tenantId || !this.clientSecret) {
      throw new Error('Credenciais do Microsoft Graph API não configuradas. Verifique as variáveis de ambiente: MS_CLIENT_ID, MS_TENANT_ID, MS_CLIENT_SECRET');
    }

    try {
      const params = new URLSearchParams();
      params.append('client_id', this.clientId);
      params.append('scope', 'https://graph.microsoft.com/.default');
      params.append('client_secret', this.clientSecret);
      params.append('grant_type', 'client_credentials');

      const response = await fetch(this.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Erro ao obter access token:', errorText);
        throw new Error(`Falha na autenticação: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      this.accessToken = data.access_token;
      // Calcula o tempo de expiração (expires_in está em segundos)
      this.tokenExpiresAt = now + (data.expires_in * 1000);
      
      console.log(`✅ Access token obtido com sucesso. Expira em ${data.expires_in} segundos`);
      
      return this.accessToken;
    } catch (error) {
      console.error('❌ Erro ao obter access token:', error);
      throw new Error(`Erro na autenticação OneDrive: ${error.message}`);
    }
  }

  /**
   * Faz upload de um arquivo para o OneDrive
   * 
   * @param {string} fileName - Nome do arquivo (ex: "ABC123.jpg")
   * @param {Buffer} fileBuffer - Buffer do arquivo a ser enviado
   * @returns {Promise<{itemId: string, webUrl: string}>} ID do item e URL web
   */
  async uploadFile(fileName, fileBuffer) {
    try {
      const accessToken = await this.getAccessToken();
      
      // Caminho completo do arquivo no OneDrive
      const filePath = `${this.driveItemPath}/${fileName}`;
      const uploadUrl = `${this.graphApiBase}${filePath}:/content`;
      
      console.log(`📤 Fazendo upload de ${fileName} (${fileBuffer.length} bytes) para OneDrive...`);
      
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/octet-stream',
        },
        body: fileBuffer,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Erro no upload:', errorText);
        
        // Se o erro for 409 (conflito), tenta obter o item existente
        if (response.status === 409) {
          console.log('⚠️ Arquivo já existe, obtendo informações do item existente...');
          return await this.getFileInfo(fileName);
        }
        
        throw new Error(`Falha no upload: ${response.status} - ${errorText}`);
      }

      const uploadResult = await response.json();
      
      console.log(`✅ Upload concluído: ${fileName}`);
      console.log(`   Item ID: ${uploadResult.id}`);
      
      return {
        itemId: uploadResult.id,
        webUrl: uploadResult.webUrl,
        name: uploadResult.name,
      };
    } catch (error) {
      console.error('❌ Erro ao fazer upload para OneDrive:', error);
      throw new Error(`Erro no upload OneDrive: ${error.message}`);
    }
  }

  /**
   * Obtém informações de um arquivo existente no OneDrive
   * 
   * @param {string} fileName - Nome do arquivo
   * @returns {Promise<{itemId: string, webUrl: string}>}
   */
  async getFileInfo(fileName) {
    try {
      const accessToken = await this.getAccessToken();
      const filePath = `${this.driveItemPath}/${fileName}`;
      const infoUrl = `${this.graphApiBase}${filePath}`;
      
      const response = await fetch(infoUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Arquivo não encontrado: ${response.status}`);
      }

      const fileInfo = await response.json();
      
      return {
        itemId: fileInfo.id,
        webUrl: fileInfo.webUrl,
        name: fileInfo.name,
      };
    } catch (error) {
      console.error('❌ Erro ao obter informações do arquivo:', error);
      throw error;
    }
  }

  /**
   * Cria ou obtém um link público compartilhável para um arquivo
   * 
   * @param {string} itemId - ID do item no OneDrive
   * @returns {Promise<string>} URL pública compartilhável
   */
  async getShareLink(itemId) {
    try {
      const accessToken = await this.getAccessToken();
      
      // Primeiro, verifica se já existe um link compartilhado
      const permissionsUrl = `${this.graphApiBase}/me/drive/items/${itemId}/permissions`;
      
      let shareLink = null;
      
      // Tenta obter permissões existentes
      try {
        const permissionsResponse = await fetch(permissionsUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });
        
        if (permissionsResponse.ok) {
          const permissions = await permissionsResponse.json();
          // Procura por um link compartilhado existente
          const shareLinkPermission = permissions.value?.find(
            p => p.link?.type === 'view' || p.link?.type === 'edit'
          );
          
          if (shareLinkPermission?.link?.webUrl) {
            shareLink = shareLinkPermission.link.webUrl;
            console.log('✅ Link compartilhado existente encontrado');
          }
        }
      } catch (err) {
        console.log('ℹ️ Nenhum link compartilhado existente encontrado, criando novo...');
      }
      
      // Se não encontrou link existente, cria um novo
      if (!shareLink) {
        const createLinkUrl = `${this.graphApiBase}/me/drive/items/${itemId}/createLink`;
        
        const createLinkResponse = await fetch(createLinkUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'view', // Tipo de link: 'view' (somente leitura) ou 'edit' (edição)
            scope: 'anonymous', // 'anonymous' permite acesso sem autenticação
          }),
        });

        if (!createLinkResponse.ok) {
          const errorText = await createLinkResponse.text();
          throw new Error(`Falha ao criar link compartilhado: ${createLinkResponse.status} - ${errorText}`);
        }

        const linkData = await createLinkResponse.json();
        shareLink = linkData.link.webUrl;
        
        console.log('✅ Link compartilhado criado com sucesso');
      }
      
      // Converte o link do OneDrive para um formato direto de download/imagem
      // O link compartilhado do OneDrive pode ser convertido para um link direto
      // Substituindo a URL para obter um link direto de visualização
      const directLink = shareLink.replace('/redir?', '/download?');
      
      return directLink;
    } catch (error) {
      console.error('❌ Erro ao obter/criar link compartilhado:', error);
      throw new Error(`Erro ao obter link compartilhado: ${error.message}`);
    }
  }

  /**
   * Faz upload de arquivo e retorna a URL pública diretamente
   * Método de conveniência que combina uploadFile + getShareLink
   * 
   * @param {string} fileName - Nome do arquivo
   * @param {Buffer} fileBuffer - Buffer do arquivo
   * @returns {Promise<string>} URL pública compartilhável
   */
  async uploadFileAndGetPublicUrl(fileName, fileBuffer) {
    try {
      // Faz upload do arquivo
      const uploadResult = await this.uploadFile(fileName, fileBuffer);
      
      // Obtém o link público
      const publicUrl = await this.getShareLink(uploadResult.itemId);
      
      console.log(`✅ Upload completo e URL pública gerada: ${publicUrl}`);
      
      return publicUrl;
    } catch (error) {
      console.error('❌ Erro no upload e obtenção de URL pública:', error);
      throw error;
    }
  }

  /**
   * Deleta um arquivo do OneDrive
   * 
   * @param {string} fileName - Nome do arquivo a ser deletado
   * @returns {Promise<void>}
   */
  async deleteFile(fileName) {
    try {
      const accessToken = await this.getAccessToken();
      const filePath = `${this.driveItemPath}/${fileName}`;
      const deleteUrl = `${this.graphApiBase}${filePath}`;
      
      console.log(`🗑️ Deletando arquivo ${fileName} do OneDrive...`);
      
      const response = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok && response.status !== 404) {
        const errorText = await response.text();
        throw new Error(`Falha ao deletar arquivo: ${response.status} - ${errorText}`);
      }

      console.log(`✅ Arquivo ${fileName} deletado com sucesso`);
    } catch (error) {
      console.error('❌ Erro ao deletar arquivo do OneDrive:', error);
      throw new Error(`Erro ao deletar arquivo: ${error.message}`);
    }
  }
}

// Exporta uma instância singleton do serviço
module.exports = new OneDriveService();


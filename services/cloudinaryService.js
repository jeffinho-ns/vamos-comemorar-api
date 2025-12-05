/**
 * Serviço Cloudinary - Armazenamento de Imagens
 * 
 * Este serviço gerencia o upload e exclusão de imagens no Cloudinary.
 * 
 * Funcionalidades:
 * - Upload de arquivos para o Cloudinary
 * - Geração automática de URLs públicas seguras
 * - Exclusão de arquivos
 * - Otimização automática de imagens
 */

const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');

class CloudinaryService {
  constructor() {
    // Configurações do Cloudinary
    this.cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    this.apiKey = process.env.CLOUDINARY_API_KEY;
    this.apiSecret = process.env.CLOUDINARY_API_SECRET;
    
    // Configurar Cloudinary
    if (this.cloudName && this.apiKey && this.apiSecret) {
      cloudinary.config({
        cloud_name: this.cloudName,
        api_key: this.apiKey,
        api_secret: this.apiSecret,
        secure: true
      });
      console.log('✅ CloudinaryService inicializado');
    } else {
      console.warn('⚠️ CloudinaryService: Credenciais não configuradas');
    }
  }

  /**
   * Faz upload de um arquivo para o Cloudinary
   * 
   * @param {string} fileName - Nome do arquivo (ex: "ABC123.jpg")
   * @param {Buffer} fileBuffer - Buffer do arquivo a ser enviado
   * @param {Object} options - Opções adicionais (folder, transformation, etc)
   * @returns {Promise<{publicId: string, url: string, secureUrl: string}>}
   */
  async uploadFile(fileName, fileBuffer, options = {}) {
    try {
      if (!this.cloudName || !this.apiKey || !this.apiSecret) {
        throw new Error('Credenciais do Cloudinary não configuradas. Verifique as variáveis de ambiente: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
      }

      // Configurações padrão
      const uploadOptions = {
        folder: options.folder || 'cardapio-agilizaiapp',
        public_id: options.publicId || fileName.replace(/\.[^/.]+$/, ''), // Remove extensão
        resource_type: 'image',
        overwrite: options.overwrite || false,
        ...options
      };

      console.log(`📤 Fazendo upload de ${fileName} (${fileBuffer.length} bytes) para Cloudinary...`);
      console.log(`   Folder: ${uploadOptions.folder}`);
      console.log(`   Public ID: ${uploadOptions.public_id}`);

      // Converter buffer para stream
      const stream = Readable.from(fileBuffer);

      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) {
              console.error('❌ Erro no upload para Cloudinary:', error);
              reject(new Error(`Erro no upload Cloudinary: ${error.message}`));
            } else {
              console.log(`✅ Upload Cloudinary concluído: ${fileName}`);
              console.log(`   Public ID: ${result.public_id}`);
              console.log(`   URL: ${result.secure_url}`);
              
              resolve({
                publicId: result.public_id,
                url: result.url,
                secureUrl: result.secure_url,
                width: result.width,
                height: result.height,
                format: result.format,
                bytes: result.bytes
              });
            }
          }
        );

        stream.pipe(uploadStream);
      });

    } catch (error) {
      console.error('❌ Erro ao fazer upload para Cloudinary:', error);
      throw new Error(`Erro no upload Cloudinary: ${error.message}`);
    }
  }

  /**
   * Faz upload de arquivo e retorna a URL pública diretamente
   * Método de conveniência
   * 
   * @param {string} fileName - Nome do arquivo
   * @param {Buffer} fileBuffer - Buffer do arquivo
   * @param {Object} options - Opções adicionais
   * @returns {Promise<string>} URL pública segura
   */
  async uploadFileAndGetPublicUrl(fileName, fileBuffer, options = {}) {
    try {
      const result = await this.uploadFile(fileName, fileBuffer, options);
      return result.secureUrl;
    } catch (error) {
      console.error('❌ Erro no upload e obtenção de URL pública:', error);
      throw error;
    }
  }

  /**
   * Deleta um arquivo do Cloudinary
   * 
   * @param {string} publicId - Public ID do arquivo no Cloudinary
   * @param {Object} options - Opções adicionais (resource_type, etc)
   * @returns {Promise<void>}
   */
  async deleteFile(publicId, options = {}) {
    try {
      if (!this.cloudName || !this.apiKey || !this.apiSecret) {
        throw new Error('Credenciais do Cloudinary não configuradas');
      }

      console.log(`🗑️ Deletando arquivo ${publicId} do Cloudinary...`);

      const deleteOptions = {
        resource_type: options.resourceType || 'image',
        ...options
      };

      const result = await cloudinary.uploader.destroy(publicId, deleteOptions);

      if (result.result === 'ok') {
        console.log(`✅ Arquivo ${publicId} deletado com sucesso`);
      } else if (result.result === 'not found') {
        console.warn(`⚠️ Arquivo ${publicId} não encontrado no Cloudinary`);
      } else {
        console.warn(`⚠️ Resultado inesperado ao deletar ${publicId}: ${result.result}`);
      }

    } catch (error) {
      console.error('❌ Erro ao deletar arquivo do Cloudinary:', error);
      throw new Error(`Erro ao deletar arquivo: ${error.message}`);
    }
  }

  /**
   * Extrai o Public ID de uma URL do Cloudinary
   * 
   * @param {string} url - URL do Cloudinary
   * @returns {string|null} Public ID ou null se não for URL do Cloudinary
   */
  extractPublicIdFromUrl(url) {
    if (!url || typeof url !== 'string') return null;
    
    // URLs do Cloudinary têm o formato: https://res.cloudinary.com/{cloud_name}/image/upload/{folder}/{public_id}.{format}
    const cloudinaryPattern = /res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:v\d+\/)?(?:[^/]+\/)?(.+?)(?:\.[^.]+)?$/;
    const match = url.match(cloudinaryPattern);
    
    if (match && match[1]) {
      return match[1];
    }
    
    return null;
  }

  /**
   * Gera URL otimizada do Cloudinary
   * 
   * @param {string} publicId - Public ID do arquivo
   * @param {Object} transformations - Transformações a aplicar
   * @returns {string} URL otimizada
   */
  getOptimizedUrl(publicId, transformations = {}) {
    if (!this.cloudName) {
      throw new Error('Cloudinary não configurado');
    }

    const defaultTransformations = {
      quality: 'auto',
      fetch_format: 'auto',
      ...transformations
    };

    return cloudinary.url(publicId, {
      secure: true,
      transformation: [defaultTransformations]
    });
  }
}

// Exporta uma instância singleton do serviço
module.exports = new CloudinaryService();





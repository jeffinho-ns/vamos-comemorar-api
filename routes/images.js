const express = require('express');
const multer = require('multer');
const path = require('path');
const { customAlphabet } = require('nanoid');
const cloudinaryService = require('../services/cloudinaryService');

const router = express.Router();

// Configuração Multer para armazenamento em memória
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // Limite de 10MB
  },
  fileFilter: (req, file, cb) => {
    console.log('🔍 Multer fileFilter - Arquivo:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });
    
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      console.log('✅ Tipo de arquivo permitido');
      cb(null, true);
    } else {
      console.log('❌ Tipo de arquivo não permitido:', file.mimetype);
      cb(new Error('Tipo de arquivo não permitido. Apenas imagens são aceitas.'), false);
    }
  }
});

// Middleware para capturar erros do multer
const handleMulterError = (error, req, res, next) => {
  console.error('💥 Erro do Multer:', error);
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Arquivo muito grande. Tamanho máximo: 10MB' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Muitos arquivos enviados' });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Campo de arquivo inesperado' });
    }
  }
  return res.status(400).json({ error: error.message });
};

// Gerador de nome de arquivo único
const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 10);

// Rota de upload unificada para todos os tipos de imagem
router.post('/upload', upload.single('image'), handleMulterError, async (req, res) => {
  console.log('📤 Iniciando upload de imagem para Cloudinary...');
  const pool = req.app.get('pool');

  if (!pool) {
    console.error('Pool de conexão não disponível.');
    return res.status(500).json({ error: 'Erro interno do servidor: pool de conexão ausente.' });
  }

  if (!req.file) {
    console.log('❌ Nenhum arquivo foi enviado');
    return res.status(400).json({ error: 'Nenhum arquivo foi enviado' });
  }

  const file = req.file;
  const extension = path.extname(file.originalname);
  const remoteFilename = `${nanoid()}${extension}`;
  
  console.log(`📋 Detalhes do arquivo: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);
  console.log(`🆔 Nome do arquivo remoto: ${remoteFilename}`);

  let cloudinarySuccess = false;
  let publicUrl = null;
  let publicId = null;

  try {
    // Faz upload para o Cloudinary e obtém URL pública
    console.log(`📤 Fazendo upload de ${remoteFilename} para Cloudinary...`);
    const uploadResult = await cloudinaryService.uploadFile(remoteFilename, file.buffer, {
      folder: 'cardapio-agilizaiapp',
      overwrite: false
    });
    
    publicUrl = uploadResult.secureUrl;
    publicId = uploadResult.publicId;
    
    console.log(`✅ Upload Cloudinary concluído: ${remoteFilename}`);
    console.log(`   Public ID: ${publicId}`);
    console.log(`   URL pública: ${publicUrl}`);
    
    cloudinarySuccess = true;

  } catch (cloudinaryError) {
    console.error('❌ Erro no upload para o Cloudinary:', cloudinaryError.message);
    console.error('Stack trace:', cloudinaryError.stack);
    return res.status(500).json({
      error: 'Erro ao fazer upload para o Cloudinary',
      details: cloudinaryError.message
    });
  }

  // Salvar no banco - URL completa do Cloudinary para exibição
  const imageData = {
    filename: remoteFilename,
    originalName: file.originalname,
    fileSize: file.size,
    mimeType: file.mimetype,
    url: publicUrl, // URL pública do Cloudinary
    type: req.body.type || 'general',
    entityId: req.body.entityId || null,
    entityType: req.body.entityType || null
  };

  try {
    const result = await pool.query(
      `INSERT INTO cardapio_images (filename, original_name, file_size, mime_type, url, type, entity_id, entity_type) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        imageData.filename,
        imageData.originalName,
        imageData.fileSize,
        imageData.mimeType,
        imageData.url,
        imageData.type,
        imageData.entityId,
        imageData.entityType
      ]
    );

    console.log(`✅ Imagem salva no banco: ID ${result.rows[0].id}, Filename: ${remoteFilename}`);
    
    res.json({
      success: true,
      imageId: result.rows[0].id,
      filename: remoteFilename,
      url: publicUrl, // URL completa do Cloudinary
      publicId: publicId, // Public ID do Cloudinary (para futuras operações)
      message: 'Imagem enviada com sucesso'
    });

  } catch (dbError) {
    console.error('❌ Erro ao salvar no banco:', dbError.message);
    console.error('Stack trace:', dbError.stack);
    
    // Remove do Cloudinary se falhar no banco
    if (cloudinarySuccess && publicId) {
      try {
        await cloudinaryService.deleteFile(publicId);
        console.log('🗑️ Arquivo removido do Cloudinary após erro no banco.');
      } catch (removeError) {
        console.warn('⚠️ Falha ao remover arquivo do Cloudinary após erro no banco:', removeError.message);
      }
    }
    
    return res.status(500).json({ 
      error: 'Erro ao salvar imagem no banco de dados',
      details: dbError.message 
    });
  }
});

// Lista imagens
router.get('/list', async (req, res) => {
  const pool = req.app.get('pool');
  if (!pool) return res.status(500).json({ error: 'Pool de conexão indisponível' });

  try {
    const { type, entityType, entityId } = req.query;
    let query = 'SELECT * FROM cardapio_images WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (type) { query += ` AND type = $${paramIndex++}`; params.push(type); }
    if (entityType) { query += ` AND entity_type = $${paramIndex++}`; params.push(entityType); }
    if (entityId) { query += ` AND entity_id = $${paramIndex++}`; params.push(entityId); }

    query += ' ORDER BY uploaded_at DESC';
    const result = await pool.query(query, params);

    res.json({ success: true, images: result.rows });
  } catch (error) {
    console.error('Erro ao listar imagens:', error.stack);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Deleta imagem
router.delete('/:imageId', async (req, res) => {
  const pool = req.app.get('pool');

  if (!pool) return res.status(500).json({ error: 'Pool de conexão indisponível' });

  try {
    const { imageId } = req.params;
    const result = await pool.query('SELECT * FROM cardapio_images WHERE id = $1', [imageId]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Imagem não encontrada' });
    const image = result.rows[0];

    await pool.query('DELETE FROM cardapio_images WHERE id = $1', [imageId]);

    // Tenta deletar do Cloudinary
    try {
      // Extrai o Public ID da URL do Cloudinary ou usa o filename
      const publicId = cloudinaryService.extractPublicIdFromUrl(image.url) || image.filename;
      await cloudinaryService.deleteFile(publicId);
      console.log(`✅ Arquivo ${publicId} deletado do Cloudinary`);
    } catch (cloudinaryError) {
      console.warn('⚠️ Erro ao deletar do Cloudinary (arquivo pode não existir):', cloudinaryError.message);
      // Não falha a requisição se o arquivo não existir no Cloudinary
    }

    res.json({ success: true, message: 'Imagem deletada com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar imagem:', error.stack);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Busca imagem por ID
router.get('/:imageId', async (req, res) => {
  const pool = req.app.get('pool');
  if (!pool) return res.status(500).json({ error: 'Pool de conexão indisponível' });

  try {
    const { imageId } = req.params;
    const result = await pool.query('SELECT * FROM cardapio_images WHERE id = $1', [imageId]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Imagem não encontrada' });

    res.json({ success: true, image: result.rows[0] });
  } catch (error) {
    console.error('Erro ao buscar imagem:', error.stack);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = (pool) => router;
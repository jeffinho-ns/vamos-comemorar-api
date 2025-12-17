const express = require('express');
const multer = require('multer');
const path = require('path');
const { customAlphabet } = require('nanoid');
const firebaseStorage = require('../services/firebaseStorageAdminService');

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
  console.log('📤 Iniciando upload de imagem para Firebase Storage...');
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
  const folder = req.body.folder || 'cardapio-agilizaiapp';
  const objectPath = `${String(folder).replace(/^\/+/, '').replace(/\/+$/, '')}/${remoteFilename}`;
  
  console.log(`📋 Detalhes do arquivo: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);
  console.log(`🆔 Objeto remoto: ${objectPath}`);

  try {
    // Faz upload para o Firebase Storage (Admin) e obtém URL pública via token
    console.log(`📤 Fazendo upload de ${objectPath} para Firebase Storage...`);
    const uploadResult = await firebaseStorage.uploadBuffer({
      objectPath,
      buffer: file.buffer,
      contentType: file.mimetype,
    });

    const publicUrl = uploadResult.url;

    console.log(`✅ Upload Firebase concluído: ${objectPath}`);
    console.log(`   URL pública: ${publicUrl}`);

    // Salvar no banco - armazenar filename como objectPath (estável) e url como downloadURL
    const imageData = {
      filename: objectPath,
      originalName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      url: publicUrl,
      type: req.body.type || 'general',
      entityId: req.body.entityId || null,
      entityType: req.body.entityType || null,
    };

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
        imageData.entityType,
      ],
    );

    console.log(`✅ Imagem salva no banco: ID ${result.rows[0].id}, Filename: ${objectPath}`);

    return res.json({
      success: true,
      imageId: result.rows[0].id,
      filename: objectPath,
      url: publicUrl,
      message: 'Imagem enviada com sucesso',
    });
  } catch (err) {
    console.error('❌ Erro no upload Firebase:', err.message);
    console.error('Stack trace:', err.stack);
    return res.status(500).json({
      error: 'Erro ao fazer upload para o Firebase Storage',
      details: err.message,
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

    // Tenta deletar do Firebase Storage
    try {
      await firebaseStorage.deleteByUrlOrPath(image.filename || image.url);
      console.log(`✅ Arquivo deletado do Firebase Storage: ${image.filename || image.url}`);
    } catch (storageError) {
      console.warn('⚠️ Erro ao deletar do Firebase Storage (arquivo pode não existir):', storageError.message);
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
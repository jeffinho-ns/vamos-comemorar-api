const express = require('express');
const multer = require('multer');
const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const { customAlphabet } = require('nanoid');
const firebaseStorage = require('../services/firebaseStorageAdminService');
const sharp = require('sharp');

const router = express.Router();

const MAX_UPLOAD_MB = 100;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

// Configuração Multer para armazenamento em disco (evita estourar RAM com uploads grandes)
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, os.tmpdir()),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').slice(0, 10) || '';
      cb(null, `upload-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
    },
  }),
  limits: {
    fileSize: MAX_UPLOAD_BYTES, // Limite de 100MB (airbag)
  },
  fileFilter: (req, file, cb) => {
    console.log('🔍 Multer fileFilter - Arquivo:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
    });

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      console.log('✅ Tipo de arquivo permitido');
      cb(null, true);
    } else {
      console.log('❌ Tipo de arquivo não permitido:', file.mimetype);
      cb(new Error('Tipo de arquivo não permitido. Apenas imagens são aceitas.'), false);
    }
  },
});

// Middleware para capturar erros do multer
const handleMulterError = (error, req, res, next) => {
  console.error('💥 Erro do Multer:', error);
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res
        .status(400)
        .json({ error: `Arquivo muito grande. Tamanho máximo: ${MAX_UPLOAD_MB}MB` });
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

async function optimizeImage({ filePath, mimetype }) {
  // Para GIF (principalmente animado), evitar "quebrar" animação aqui; mantém original.
  if (mimetype === 'image/gif') {
    const original = await fs.readFile(filePath);
    return {
      buffer: original,
      contentType: mimetype,
      extension: '.gif',
      optimized: false,
    };
  }

  const pipeline = sharp(filePath, { failOnError: false }).rotate();

  pipeline.resize({
    width: 2000,
    height: 2000,
    fit: 'inside',
    withoutEnlargement: true,
  });

  const buffer = await pipeline
    .webp({
      quality: 80,
      effort: 4,
    })
    .toBuffer();

  return {
    buffer,
    contentType: 'image/webp',
    extension: '.webp',
    optimized: true,
  };
}

function buildVariantPaths({ folder, baseId, extension }) {
  const objectBase = `${folder}/${baseId}`;
  // Para GIF, manter extensão original e não gerar variantes.
  if (extension === '.gif') {
    return {
      full: `${objectBase}${extension}`,
      medium: null,
      thumb: null,
    };
  }
  return {
    full: `${objectBase}_full${extension}`,
    medium: `${objectBase}_medium${extension}`,
    thumb: `${objectBase}_thumb${extension}`,
  };
}

async function generateVariants({ buffer, extension, contentType }) {
  if (extension === '.gif') {
    return {
      full: { buffer, contentType, extension },
      medium: null,
      thumb: null,
    };
  }

  // Gerar a partir do buffer já convertido (webp) para reduzir custo.
  const thumbBuffer = await sharp(buffer, { failOnError: false })
    .resize({ width: 300, height: 300, fit: 'inside', withoutEnlargement: true })
    .toBuffer();

  const mediumBuffer = await sharp(buffer, { failOnError: false })
    .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
    .toBuffer();

  return {
    full: { buffer, contentType, extension },
    medium: { buffer: mediumBuffer, contentType, extension },
    thumb: { buffer: thumbBuffer, contentType, extension },
  };
}

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
  const folder = req.body.folder || 'cardapio-agilizaiapp';
  const safeFolder = String(folder).replace(/^\/+/, '').replace(/\/+$/, '');
  let processed = null;
  
  try {
    console.log(`📋 Detalhes do arquivo: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);
    console.log(`🧰 Otimizando imagem (quando aplicável)...`);

    processed = await optimizeImage({ filePath: file.path, mimetype: file.mimetype });

    const baseId = nanoid();
    const paths = buildVariantPaths({ folder: safeFolder, baseId, extension: processed.extension });
    const variants = await generateVariants({
      buffer: processed.buffer,
      extension: processed.extension,
      contentType: processed.contentType,
    });

    console.log(`🆔 Objeto remoto (full): ${paths.full}`);
    console.log(`📦 Tamanho original: ${file.size} bytes`);
    console.log(`📦 Tamanho final: ${processed.buffer.length} bytes (${processed.contentType})`);

    // Upload full/medium/thumb (quando aplicável).
    console.log(`📤 Fazendo upload (full) para Firebase Storage...`);
    await firebaseStorage.uploadBuffer({
      objectPath: paths.full,
      buffer: variants.full.buffer,
      contentType: variants.full.contentType,
    });

    if (paths.medium && variants.medium) {
      console.log(`📤 Fazendo upload (medium) para Firebase Storage...`);
      await firebaseStorage.uploadBuffer({
        objectPath: paths.medium,
        buffer: variants.medium.buffer,
        contentType: variants.medium.contentType,
      });
    }

    if (paths.thumb && variants.thumb) {
      console.log(`📤 Fazendo upload (thumb) para Firebase Storage...`);
      await firebaseStorage.uploadBuffer({
        objectPath: paths.thumb,
        buffer: variants.thumb.buffer,
        contentType: variants.thumb.contentType,
      });
    }

    const apiBaseUrl = `${req.protocol}://${req.get('host')}`;
    const fullProxyUrl = `${apiBaseUrl}/public/images/${encodeURIComponent(paths.full)}`;
    const thumbProxyUrl = paths.thumb
      ? `${apiBaseUrl}/public/images/${encodeURIComponent(paths.thumb)}`
      : fullProxyUrl;
    const mediumProxyUrl = paths.medium
      ? `${apiBaseUrl}/public/images/${encodeURIComponent(paths.medium)}`
      : fullProxyUrl;

    console.log(`✅ Upload Firebase concluído: ${paths.full}`);
    console.log(`   URL (proxy full): ${fullProxyUrl}`);

    // Salvar no banco - armazenar filename como objectPath (estável).
    // NUNCA armazenar URL com token do Firebase (evita vazamentos acidentais).
    const imageData = {
      filename: paths.full,
      originalName: file.originalname,
      fileSize: variants.full.buffer.length,
      mimeType: variants.full.contentType,
      url: fullProxyUrl,
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

    console.log(`✅ Imagem salva no banco: ID ${result.rows[0].id}, Filename: ${paths.full}`);

    return res.json({
      success: true,
      imageId: result.rows[0].id,
      filename: paths.full,
      url: thumbProxyUrl,
      fullUrl: fullProxyUrl,
      mediumUrl: mediumProxyUrl,
      thumbUrl: thumbProxyUrl,
      message: 'Imagem enviada com sucesso',
      original: {
        fileSize: file.size,
        mimeType: file.mimetype,
      },
      optimized: {
        applied: !!processed?.optimized,
        fileSize: variants?.full?.buffer?.length || null,
        mimeType: variants?.full?.contentType || null,
      },
    });
  } catch (err) {
    console.error('❌ Erro no upload Firebase:', err.message);
    console.error('Stack trace:', err.stack);
    return res.status(500).json({
      error: 'Erro ao fazer upload para o Firebase Storage',
      details: err.message,
    });
  } finally {
    // Limpar arquivo temporário do disco
    try {
      if (file?.path) await fs.unlink(file.path);
    } catch (e) {
      console.warn('⚠️ Falha ao remover arquivo temporário:', e.message);
    }
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
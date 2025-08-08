// images.js

const express = require('express');
const multer = require('multer');
const path = require('path');
const ftp = require('basic-ftp');
const { customAlphabet } = require('nanoid');

const router = express.Router();

// Configuração Multer para armazenamento em memória
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // Limite de 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido. Apenas imagens são aceitas.'), false);
    }
  }
});

// Configuração FTP - Usar APENAS variáveis de ambiente
const ftpConfig = {
  host: process.env.FTP_HOST || '195.35.41.247',
  user: process.env.FTP_USER || 'u621081794',
  password: process.env.FTP_PASSWORD || 'Jeffl1ma!@',
  secure: process.env.FTP_SECURE === 'true',
  port: parseInt(process.env.FTP_PORT) || 21,
  remoteDirectory: process.env.FTP_REMOTE_DIR || '/cardapio-agilizaiapp/',
  baseUrl: process.env.FTP_BASE_URL || 'https://www.grupoideiaum.com.br/cardapio-agilizaiapp/'
};

// Gerador de nome de arquivo único de 10 caracteres
const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 10);

// Função para fazer upload de um buffer para o FTP
async function uploadBufferToFTP(buffer, remoteDirectory, remoteFilename) {
  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    await client.access(ftpConfig);
    await client.ensureDir(remoteDirectory);
    await client.uploadFrom(buffer, remoteFilename);
    return true;
  } catch (error) {
    console.error('Erro no upload FTP:', error);
    return false;
  } finally {
    client.close();
  }
}

// Rota para upload de imagem
router.post('/upload', upload.single('image'), async (req, res) => {
  const pool = req.app.get('pool');
  
  if (!pool) {
      console.error('Pool de conexão com o banco não disponível.');
      return res.status(500).json({ error: 'Erro interno do servidor: pool de conexão não disponível.' });
  }

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo foi enviado' });
    }

    const file = req.file;
    const extension = path.extname(file.originalname);
    const remoteFilename = `${nanoid()}${extension}`; // Nome de arquivo único
    const imageUrl = `${ftpConfig.baseUrl}${remoteFilename}`;
    
    // Faz o upload direto do buffer para o FTP
    const ftpSuccess = await uploadBufferToFTP(file.buffer, ftpConfig.remoteDirectory, remoteFilename);

    if (!ftpSuccess) {
      return res.status(500).json({ error: 'Erro ao fazer upload para o servidor FTP. Verifique as credenciais ou permissões.' });
    }

    const imageData = {
      filename: remoteFilename,
      originalName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      url: imageUrl,
      type: req.body.type || 'general',
      entityId: req.body.entityId || null,
      entityType: req.body.entityType || null
    };

    // Salvar no banco de dados
    const [result] = await pool.execute(
      `INSERT INTO cardapio_images (filename, original_name, file_size, mime_type, url, uploaded_at, type, entity_id, entity_type) 
       VALUES (?, ?, ?, ?, ?, NOW(), ?, ?, ?)`,
      [imageData.filename, imageData.originalName, imageData.fileSize, imageData.mimeType, imageData.url, imageData.type, imageData.entityId, imageData.entityType]
    );

    res.json({
      success: true,
      imageId: result.insertId,
      filename: remoteFilename,
      url: imageUrl,
      message: 'Imagem enviada com sucesso'
    });

  } catch (error) {
    console.error('Erro no upload:', error);
    res.status(500).json({ error: 'Erro interno do servidor. Detalhes: ' + error.message });
  }
});

// A rota de imagens não precisa de pool para as rotas abaixo, então as rotas estão fora da função de exportação
router.get('/list', async (req, res) => {
  const pool = req.app.get('pool');
  if (!pool) {
      return res.status(500).json({ error: 'Erro interno do servidor: pool de conexão não disponível.' });
  }
  try {
    const { type, entityType, entityId } = req.query;
    
    let query = 'SELECT * FROM cardapio_images WHERE 1=1';
    const params = [];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    if (entityType) {
      query += ' AND entity_type = ?';
      params.push(entityType);
    }

    if (entityId) {
      query += ' AND entity_id = ?';
      params.push(entityId);
    }

    query += ' ORDER BY uploaded_at DESC';

    const [rows] = await pool.execute(query, params);

    res.json({
      success: true,
      images: rows
    });

  } catch (error) {
    console.error('Erro ao listar imagens:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.delete('/:imageId', async (req, res) => {
  const pool = req.app.get('pool');
  if (!pool) {
      return res.status(500).json({ error: 'Erro interno do servidor: pool de conexão não disponível.' });
  }
  try {
    const { imageId } = req.params;

    const [rows] = await pool.execute(
      'SELECT * FROM cardapio_images WHERE id = ?',
      [imageId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Imagem não encontrada' });
    }

    const image = rows[0];

    await pool.execute(
      'DELETE FROM cardapio_images WHERE id = ?',
      [imageId]
    );

    try {
      const client = new ftp.Client();
      client.ftp.verbose = false;
      await client.access(ftpConfig);
      await client.remove(`${ftpConfig.remoteDirectory}${image.filename}`);
      client.close();
    } catch (ftpError) {
      console.warn('Erro ao deletar do FTP:', ftpError);
    }

    res.json({
      success: true,
      message: 'Imagem deletada com sucesso'
    });

  } catch (error) {
    console.error('Erro ao deletar imagem:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/:imageId', async (req, res) => {
  const pool = req.app.get('pool');
  if (!pool) {
      return res.status(500).json({ error: 'Erro interno do servidor: pool de conexão não disponível.' });
  }
  try {
    const { imageId } = req.params;

    const [rows] = await pool.execute(
      'SELECT * FROM cardapio_images WHERE id = ?',
      [imageId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Imagem não encontrada' });
    }

    res.json({
      success: true,
      image: rows[0]
    });

  } catch (error) {
    console.error('Erro ao buscar imagem:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = (pool) => {
  return router;
};

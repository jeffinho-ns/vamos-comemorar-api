const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ftp = require('basic-ftp');

const router = express.Router();

// Configuração do Multer para upload local
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/cardapio');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Gerar nome único para o arquivo
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const extension = path.extname(file.originalname);
    const filename = `${timestamp}-${randomString}${extension}`;
    cb(null, filename);
  }
});

// Filtro para validar tipos de arquivo
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de arquivo não permitido. Apenas imagens são aceitas.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

// Configuração FTP - usar variáveis de ambiente em produção
const ftpConfig = {
  host: process.env.FTP_HOST || '195.35.41.247',
  user: process.env.FTP_USER || 'u621081794',
  password: process.env.FTP_PASSWORD || 'Jeffl1ma!@',
  secure: process.env.FTP_SECURE === 'true' || false,
  port: parseInt(process.env.FTP_PORT) || 21,
  remoteDirectory: process.env.FTP_REMOTE_DIR || '/cardapio-agilizaiapp/',
  baseUrl: process.env.FTP_BASE_URL || 'https://www.grupoideiaum.com.br/cardapio-agilizaiapp/'
};

// Função para fazer upload via FTP
async function uploadToFTP(localPath, remoteFilename) {
  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    await client.access(ftpConfig);
    await client.ensureDir(ftpConfig.remoteDirectory);
    await client.uploadFrom(localPath, remoteFilename);
    client.close();
    return true;
  } catch (error) {
    console.error('Erro no upload FTP:', error);
    client.close();
    return false;
  }
}

// Função para salvar informações da imagem no banco
async function saveImageToDatabase(pool, imageData) {
  try {
    const query = `
      INSERT INTO cardapio_images (
        filename, 
        original_name, 
        file_size, 
        mime_type, 
        url, 
        uploaded_at,
        type,
        entity_id,
        entity_type
      ) VALUES (?, ?, ?, ?, ?, NOW(), ?, ?, ?)
    `;

    const [result] = await pool.execute(query, [
      imageData.filename,
      imageData.originalName,
      imageData.fileSize,
      imageData.mimeType,
      imageData.url,
      imageData.type || 'general',
      imageData.entityId || null,
      imageData.entityType || null
    ]);

    return result.insertId;
  } catch (error) {
    console.error('Erro ao salvar no banco:', error);
    throw error;
  }
}

// Rota para upload de imagem
router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo foi enviado' });
    }

    const file = req.file;
    const remoteFilename = file.filename;
    const localPath = file.path;
    const imageUrl = `${ftpConfig.baseUrl}${remoteFilename}`;

    // Fazer upload via FTP
    const ftpSuccess = await uploadToFTP(localPath, remoteFilename);

    if (!ftpSuccess) {
      return res.status(500).json({ error: 'Erro ao fazer upload para o servidor FTP' });
    }

    // Preparar dados para o banco
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
    const imageId = await saveImageToDatabase(req.app.get('pool'), imageData);

    // Remover arquivo local após upload bem-sucedido
    fs.unlinkSync(localPath);

    res.json({
      success: true,
      imageId: imageId,
      filename: remoteFilename,
      url: imageUrl,
      message: 'Imagem enviada com sucesso'
    });

  } catch (error) {
    console.error('Erro no upload:', error);
    
    // Remover arquivo local em caso de erro
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota para listar imagens
router.get('/list', async (req, res) => {
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

    const [rows] = await req.app.get('pool').execute(query, params);

    res.json({
      success: true,
      images: rows
    });

  } catch (error) {
    console.error('Erro ao listar imagens:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota para deletar imagem
router.delete('/:imageId', async (req, res) => {
  try {
    const { imageId } = req.params;

    // Buscar informações da imagem
    const [rows] = await req.app.get('pool').execute(
      'SELECT * FROM cardapio_images WHERE id = ?',
      [imageId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Imagem não encontrada' });
    }

    const image = rows[0];

    // Deletar do banco de dados
    await req.app.get('pool').execute(
      'DELETE FROM cardapio_images WHERE id = ?',
      [imageId]
    );

    // Tentar deletar do servidor FTP (opcional)
    try {
      const client = new ftp.Client();
      client.ftp.verbose = false;
      await client.access(ftpConfig);
      await client.remove(`${ftpConfig.remoteDirectory}${image.filename}`);
      client.close();
    } catch (ftpError) {
      console.warn('Erro ao deletar do FTP:', ftpError);
      // Continua mesmo se falhar no FTP
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

// Rota para buscar imagem por ID
router.get('/:imageId', async (req, res) => {
  try {
    const { imageId } = req.params;

    const [rows] = await req.app.get('pool').execute(
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

module.exports = router; 
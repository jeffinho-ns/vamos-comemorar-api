// images.js

const express = require('express');
const multer = require('multer');
const path = require('path');
const ftp = require('basic-ftp');
const { customAlphabet } = require('nanoid');
const { Readable } = require('stream');

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

// Gerador de nome de arquivo único de 10 caracteres
const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 10);

// Rota para upload de imagem
router.post('/upload', upload.single('image'), async (req, res) => {
  const pool = req.app.get('pool');
  const ftpConfig = req.app.get('ftpConfig');
  
  if (!pool || !ftpConfig) {
      console.error('Dependências do servidor não disponíveis.');
      return res.status(500).json({ error: 'Erro interno do servidor: pool de conexão ou configuração FTP não disponível.' });
  }

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo foi enviado' });
    }

    const file = req.file;
    const extension = path.extname(file.originalname);
    const remoteFilename = `${nanoid()}${extension}`; // Nome de arquivo único
    const imageUrl = `${ftpConfig.baseUrl}${remoteFilename}`;

    let ftpSuccess = false;
    let ftpErrorDetails = null;

    const client = new ftp.Client();
    client.ftp.verbose = true;
    
    try {
        console.log('Tentando conectar ao FTP...');
        await client.access({
            host: ftpConfig.host,
            user: ftpConfig.user,
            password: ftpConfig.password,
            secure: ftpConfig.secure,
            port: ftpConfig.port
        });
        console.log('Conexão FTP estabelecida com sucesso.');
        
        console.log('Tentando garantir o diretório remoto...');
        // O cliente FTP já entra no diretório raiz do usuário.
        // O caminho a ser usado é relativo a esse diretório.
        const simplifiedRemotePath = ftpConfig.remoteDirectory.split('public_html/')[1];
        await client.ensureDir(simplifiedRemotePath);
        console.log('Diretório remoto garantido:', simplifiedRemotePath);
        
        console.log('Iniciando upload do buffer para o FTP...');
        const readableStream = Readable.from(file.buffer);
        await client.uploadFrom(readableStream, remoteFilename);
        console.log('Upload FTP concluído com sucesso.');
        ftpSuccess = true;
    } catch (error) {
        console.error('Erro detalhado no upload FTP:', error);
        ftpErrorDetails = error.message;
    } finally {
        await client.close();
        console.log('Conexão FTP fechada.');
    }

    if (!ftpSuccess) {
      return res.status(500).json({ 
        error: 'Erro ao fazer upload para o servidor FTP.',
        details: ftpErrorDetails || 'Verifique as credenciais ou permissões do FTP.' 
      });
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

    const [result] = await pool.execute(
      `INSERT INTO cardapio_images (filename, original_name, file_size, mime_type, url, type, entity_id, entity_type) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
  const ftpConfig = req.app.get('ftpConfig');
  
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

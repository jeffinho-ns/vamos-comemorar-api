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

// Gerador de nome de arquivo único
const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 10);

// Rota para upload de imagem
router.post('/upload', upload.single('image'), async (req, res) => {
  console.log('📤 Iniciando upload de imagem...');
  const pool = req.app.get('pool');
  const ftpConfig = req.app.get('ftpConfig');

  if (!pool || !ftpConfig) {
    console.error('Dependências do servidor não disponíveis.');
    return res.status(500).json({ error: 'Erro interno do servidor: configuração ausente.' });
  }

  if (!req.file) {
    console.log('❌ Nenhum arquivo foi enviado');
    return res.status(400).json({ error: 'Nenhum arquivo foi enviado' });
  }

  const file = req.file;
  const extension = path.extname(file.originalname);
  const remoteFilename = `${nanoid()}${extension}`;
  const imageUrl = `${ftpConfig.baseUrl}${remoteFilename}`;
  
  console.log(`📋 Detalhes do arquivo: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);
  console.log(`🆔 Nome do arquivo remoto: ${remoteFilename}`);

  const client = new ftp.Client();
  client.ftp.verbose = true;
  let ftpSuccess = false;

  try {
    console.log('Tentando conectar ao FTP...');
    await client.access({
      host: '195.35.41.247',
      user: 'u621081794',
      password: ftpConfig.password,
      secure: ftpConfig.secure,
      port: ftpConfig.port
    });
    console.log('Conexão FTP estabelecida com sucesso.');

    console.log('Verificando diretório remoto...');
    try {
      await client.ensureDir(ftpConfig.remoteDirectory.replace(/\/+$/, ''));
      console.log('Diretório remoto verificado.');
    } catch (dirError) {
      // Ignora erros de diretório já existente
      if (!dirError.message.includes('File exists')) {
        console.log('⚠️ Erro ao verificar diretório:', dirError.message);
        // Tentar navegar para o diretório diretamente
        try {
          await client.cd(ftpConfig.remoteDirectory.replace(/\/+$/, ''));
          console.log('✅ Navegação para diretório bem-sucedida.');
        } catch (cdError) {
          console.log('❌ Erro ao navegar para diretório:', cdError.message);
          throw cdError;
        }
      } else {
        console.log('Diretório remoto já existe.');
      }
    }

    console.log(`Enviando arquivo ${remoteFilename} para o FTP...`);
    const readableStream = Readable.from(file.buffer);
    await client.uploadFrom(readableStream, remoteFilename);
    console.log(`Upload FTP concluído: ${remoteFilename} (${file.size} bytes)`);
    
    // Verificar se o arquivo foi realmente enviado
    try {
      const fileList = await client.list();
      const uploadedFile = fileList.find(f => f.name === remoteFilename);
      if (uploadedFile) {
        console.log(`✅ Arquivo confirmado no servidor: ${remoteFilename} (${uploadedFile.size} bytes)`);
      } else {
        console.log(`⚠️ Arquivo não encontrado na listagem: ${remoteFilename}`);
      }
    } catch (listError) {
      console.log(`⚠️ Erro ao listar arquivos: ${listError.message}`);
    }
    
    ftpSuccess = true;

  } catch (ftpError) {
    console.error('❌ Erro no upload para o FTP:', ftpError.message);
    console.error('Stack trace:', ftpError.stack);
    return res.status(500).json({
      error: 'Erro ao fazer upload para o servidor FTP',
      details: ftpError.message
    });
  }

  // Salvar no banco - apenas o nome do arquivo
  const imageData = {
    filename: remoteFilename,
    originalName: file.originalname,
    fileSize: file.size,
    mimeType: file.mimetype,
    url: remoteFilename, // Salvar apenas o nome do arquivo
    type: req.body.type || 'general',
    entityId: req.body.entityId || null,
    entityType: req.body.entityType || null
  };

  try {
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

    console.log(`✅ Imagem salva no banco: ID ${result.insertId}, Filename: ${remoteFilename}`);
    res.json({
      success: true,
      imageId: result.insertId,
      filename: remoteFilename,
      url: remoteFilename, // Retornar apenas o nome do arquivo
      message: 'Imagem enviada com sucesso'
    });

  } catch (dbError) {
    console.error('❌ Erro ao salvar no banco:', dbError.message);
    console.error('Stack trace:', dbError.stack);
    
    // Remove do FTP se falhar no banco
    if (ftpSuccess) {
      try {
        await client.remove(remoteFilename);
        console.log('🗑️ Arquivo removido do FTP após erro no banco.');
      } catch (removeError) {
        console.warn('⚠️ Falha ao remover arquivo do FTP após erro no banco:', removeError.message);
      }
    }
    
    return res.status(500).json({ 
      error: 'Erro ao salvar imagem no banco de dados',
      details: dbError.message 
    });
  } finally {
    client.close();
    console.log('🔌 Conexão FTP fechada.');
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

    if (type) { query += ' AND type = ?'; params.push(type); }
    if (entityType) { query += ' AND entity_type = ?'; params.push(entityType); }
    if (entityId) { query += ' AND entity_id = ?'; params.push(entityId); }

    query += ' ORDER BY uploaded_at DESC';
    const [rows] = await pool.execute(query, params);

    res.json({ success: true, images: rows });
  } catch (error) {
    console.error('Erro ao listar imagens:', error.stack);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Deleta imagem
router.delete('/:imageId', async (req, res) => {
  const pool = req.app.get('pool');
  const ftpConfig = req.app.get('ftpConfig');

  if (!pool) return res.status(500).json({ error: 'Pool de conexão indisponível' });

  try {
    const { imageId } = req.params;
    const [rows] = await pool.execute('SELECT * FROM cardapio_images WHERE id = ?', [imageId]);

    if (rows.length === 0) return res.status(404).json({ error: 'Imagem não encontrada' });
    const image = rows[0];

    await pool.execute('DELETE FROM cardapio_images WHERE id = ?', [imageId]);

    try {
      const client = new ftp.Client();
      await client.access(ftpConfig);
      await client.ensureDir(ftpConfig.remoteDirectory.replace(/\/+$/, ''));
      await client.remove(image.filename);
      client.close();
    } catch (ftpError) {
      console.warn('Erro ao deletar do FTP:', ftpError.message);
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
    const [rows] = await pool.execute('SELECT * FROM cardapio_images WHERE id = ?', [imageId]);

    if (rows.length === 0) return res.status(404).json({ error: 'Imagem não encontrada' });

    res.json({ success: true, image: rows[0] });
  } catch (error) {
    console.error('Erro ao buscar imagem:', error.stack);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = (pool) => router;

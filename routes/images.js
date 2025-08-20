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

// Rota de teste para verificar se o multer está funcionando
router.post('/test-upload', upload.single('test_file'), handleMulterError, (req, res) => {
  console.log('🧪 Teste de upload - Request recebido');
  console.log('📋 Request body:', req.body);
  console.log('📁 Request file:', req.file);
  
  if (req.file) {
    res.json({
      success: true,
      message: 'Arquivo recebido com sucesso',
      file: {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        fieldname: req.file.fieldname
      }
    });
  } else {
    res.status(400).json({
      success: false,
      message: 'Nenhum arquivo recebido'
    });
  }
});

// Gerador de nome de arquivo único
const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 10);

// Rota para upload de foto de perfil específica para o Flutter
router.post('/upload-profile-photo', upload.single('foto_perfil'), handleMulterError, async (req, res) => {
  console.log('📤 Iniciando upload de foto de perfil...');
  console.log('📋 Request body:', req.body);
  console.log('📁 Request file:', req.file);
  console.log('🔑 Headers:', req.headers);
  
  const pool = req.app.get('pool');
  const ftpConfig = req.app.get('ftpConfig');

  if (!pool || !ftpConfig) {
    console.error('❌ Dependências do servidor não disponíveis.');
    console.error('Pool:', !!pool);
    console.error('FTP Config:', !!ftpConfig);
    return res.status(500).json({ error: 'Erro interno do servidor: configuração ausente.' });
  }

  if (!req.file) {
    console.log('❌ Nenhum arquivo foi enviado');
    console.log('📋 Request files:', req.files);
    console.log('📋 Request body keys:', Object.keys(req.body));
    return res.status(400).json({ error: 'Nenhum arquivo foi enviado' });
  }

  const file = req.file;
  console.log('📁 Arquivo recebido:', {
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    buffer: !!file.buffer,
    fieldname: file.fieldname
  });
  
  const extension = path.extname(file.originalname);
  const remoteFilename = `profile_${nanoid()}${extension}`;
  const imageUrl = `${ftpConfig.baseUrl}${remoteFilename}`;
  
  console.log(`📋 Detalhes da foto de perfil: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);
  console.log(`🆔 Nome do arquivo remoto: ${remoteFilename}`);
  console.log(`🌐 URL final: ${imageUrl}`);

  const client = new ftp.Client();
  client.ftp.verbose = true;
  let ftpSuccess = false;

  try {
    console.log('Tentando conectar ao FTP...');
    console.log('Configurações FTP:', {
      host: ftpConfig.host,
      user: ftpConfig.user,
      port: ftpConfig.port,
      secure: ftpConfig.secure
    });
    
    await client.access({
      host: ftpConfig.host,
      user: ftpConfig.user,
      password: ftpConfig.password,
      secure: ftpConfig.secure,
      port: ftpConfig.port
    });
    console.log('Conexão FTP estabelecida com sucesso.');

    console.log('Verificando diretório remoto...');
    try {
      // Tentar navegar para o diretório primeiro
      await client.cd(ftpConfig.remoteDirectory.replace(/\/+$/, ''));
      console.log('✅ Navegação para diretório bem-sucedida.');
    } catch (cdError) {
      console.log('⚠️ Erro ao navegar para diretório:', cdError.message);
      // Tentar criar o diretório se não existir
      try {
        await client.ensureDir(ftpConfig.remoteDirectory.replace(/\/+$/, ''));
        console.log('✅ Diretório criado/verificado com sucesso.');
      } catch (dirError) {
        console.log('❌ Erro ao criar/verificar diretório:', dirError.message);
        // Tentar criar manualmente
        try {
          const dirs = ftpConfig.remoteDirectory.split('/').filter(d => d);
          let currentPath = '';
          for (const dir of dirs) {
            currentPath += '/' + dir;
            try {
              await client.cd(currentPath);
            } catch (e) {
              await client.send('MKD', currentPath);
              console.log(`✅ Diretório criado: ${currentPath}`);
            }
          }
          console.log('✅ Estrutura de diretórios criada com sucesso.');
        } catch (mkdirError) {
          console.log('❌ Erro ao criar estrutura de diretórios:', mkdirError.message);
          throw mkdirError;
        }
      }
    }

    console.log(`Enviando foto de perfil ${remoteFilename} para o FTP...`);
    const readableStream = Readable.from(file.buffer);
    await client.uploadFrom(readableStream, remoteFilename);
    console.log(`Upload FTP concluído: ${remoteFilename} (${file.size} bytes)`);
    
    // Aguardar um pouco para garantir que o arquivo foi processado
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verificar se o arquivo foi realmente enviado
    try {
      const fileList = await client.list();
      const uploadedFile = fileList.find(f => f.name === remoteFilename);
      if (uploadedFile) {
        console.log(`✅ Foto de perfil confirmada no servidor: ${remoteFilename} (${uploadedFile.size} bytes)`);
      } else {
        console.log(`⚠️ Foto de perfil não encontrada na listagem: ${remoteFilename}`);
        // Tentar listar novamente após um delay
        await new Promise(resolve => setTimeout(resolve, 3000));
        const fileList2 = await client.list();
        const uploadedFile2 = fileList2.find(f => f.name === remoteFilename);
        if (uploadedFile2) {
          console.log(`✅ Foto de perfil confirmada na segunda verificação: ${remoteFilename}`);
        } else {
          console.log(`❌ Foto de perfil ainda não encontrada após segunda verificação: ${remoteFilename}`);
        }
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

  // Salvar no banco - URL completa para exibição
  const imageData = {
    filename: remoteFilename,
    originalName: file.originalname,
    fileSize: file.size,
    mimeType: file.mimetype,
    url: `${ftpConfig.baseUrl}${remoteFilename}`,
    type: 'profile_photo',
    entityId: req.body.userId || null,
    entityType: 'user'
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

    console.log(`✅ Foto de perfil salva no banco: ID ${result.insertId}, Filename: ${remoteFilename}`);
    console.log(`🌐 URL completa: ${ftpConfig.baseUrl}${remoteFilename}`);
    
    res.json({
      success: true,
      imageId: result.insertId,
      filename: remoteFilename,
      url: `${ftpConfig.baseUrl}${remoteFilename}`,
      message: 'Foto de perfil enviada com sucesso'
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
      error: 'Erro ao salvar foto de perfil no banco de dados',
      details: dbError.message 
    });
  } finally {
    client.close();
    console.log('🔌 Conexão FTP fechada.');
  }
});

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
    console.log('Configurações FTP:', {
      host: ftpConfig.host,
      user: ftpConfig.user,
      port: ftpConfig.port,
      secure: ftpConfig.secure
    });
    
    await client.access({
      host: ftpConfig.host,
      user: ftpConfig.user,
      password: ftpConfig.password,
      secure: ftpConfig.secure,
      port: ftpConfig.port
    });
    console.log('Conexão FTP estabelecida com sucesso.');

    console.log('Verificando diretório remoto...');
    try {
      // Tentar navegar para o diretório primeiro
      await client.cd(ftpConfig.remoteDirectory.replace(/\/+$/, ''));
      console.log('✅ Navegação para diretório bem-sucedida.');
    } catch (cdError) {
      console.log('⚠️ Erro ao navegar para diretório:', cdError.message);
      // Tentar criar o diretório se não existir
      try {
        await client.ensureDir(ftpConfig.remoteDirectory.replace(/\/+$/, ''));
        console.log('✅ Diretório criado/verificado com sucesso.');
      } catch (dirError) {
        console.log('❌ Erro ao criar/verificar diretório:', dirError.message);
        // Tentar criar manualmente
        try {
          const dirs = ftpConfig.remoteDirectory.split('/').filter(d => d);
          let currentPath = '';
          for (const dir of dirs) {
            currentPath += '/' + dir;
            try {
              await client.cd(currentPath);
            } catch (e) {
              await client.send('MKD', currentPath);
              console.log(`✅ Diretório criado: ${currentPath}`);
            }
          }
          console.log('✅ Estrutura de diretórios criada com sucesso.');
        } catch (mkdirError) {
          console.log('❌ Erro ao criar estrutura de diretórios:', mkdirError.message);
          throw mkdirError;
        }
      }
    }

    console.log(`Enviando arquivo ${remoteFilename} para o FTP...`);
    const readableStream = Readable.from(file.buffer);
    await client.uploadFrom(readableStream, remoteFilename);
    console.log(`Upload FTP concluído: ${remoteFilename} (${file.size} bytes)`);
    
    // Aguardar um pouco para garantir que o arquivo foi processado
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verificar se o arquivo foi realmente enviado
    try {
      const fileList = await client.list();
      const uploadedFile = fileList.find(f => f.name === remoteFilename);
      if (uploadedFile) {
        console.log(`✅ Arquivo confirmado no servidor: ${remoteFilename} (${uploadedFile.size} bytes)`);
      } else {
        console.log(`⚠️ Arquivo não encontrado na listagem: ${remoteFilename}`);
        // Tentar listar novamente após um delay
        await new Promise(resolve => setTimeout(resolve, 3000));
        const fileList2 = await client.list();
        const uploadedFile2 = fileList2.find(f => f.name === remoteFilename);
        if (uploadedFile2) {
          console.log(`✅ Arquivo confirmado na segunda verificação: ${remoteFilename}`);
        } else {
          console.log(`❌ Arquivo ainda não encontrado após segunda verificação: ${remoteFilename}`);
        }
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

  // Salvar no banco - URL completa para exibição
  const imageData = {
    filename: remoteFilename,
    originalName: file.originalname,
    fileSize: file.size,
    mimeType: file.mimetype,
    url: `${ftpConfig.baseUrl}${remoteFilename}`, // URL completa para exibição
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
    console.log(`🌐 URL completa: ${ftpConfig.baseUrl}${remoteFilename}`);
    
    // Verificar se a URL está acessível
    try {
      const testUrl = `${ftpConfig.baseUrl}${remoteFilename}`;
      console.log(`🔍 URL da imagem: ${testUrl}`);
      
      // Testar algumas variações da URL para debug
      const variations = [
        testUrl,
        testUrl.replace('https://', 'http://'),
        testUrl.replace('grupoideiaum.com.br', 'www.grupoideiaum.com.br'),
        `https://grupoideiaum.com.br/cardapio-agilizaiapp/${remoteFilename}`
      ];
      
      console.log('🔍 Variações de URL para teste:', variations);
    } catch (urlError) {
      console.log(`⚠️ Erro ao testar URL: ${urlError.message}`);
    }
    
    res.json({
      success: true,
      imageId: result.insertId,
      filename: remoteFilename,
      url: `${ftpConfig.baseUrl}${remoteFilename}`, // URL completa para exibição
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

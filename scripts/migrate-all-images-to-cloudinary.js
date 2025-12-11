/**
 * Script de Migração Completa de Imagens para Cloudinary
 * 
 * Este script faz upload de todas as imagens dos projetos para o Cloudinary:
 * - vamos-comemorar-next/app/assets/
 * - vamos-comemorar-next/public/images/
 * - agilizaiapp/assets/images/
 * 
 * E gera um arquivo de mapeamento para atualizar as referências no código.
 */

const fs = require('fs');
const path = require('path');
const cloudinaryService = require('../services/cloudinaryService');

// Configuração de pastas e seus respectivos folders no Cloudinary
const IMAGE_DIRECTORIES = [
  {
    localPath: path.join(__dirname, '../../vamos-comemorar-next/app/assets'),
    cloudinaryFolder: 'vamos-comemorar-next/assets',
    description: 'Next.js App Assets'
  },
  {
    localPath: path.join(__dirname, '../../vamos-comemorar-next/public/images'),
    cloudinaryFolder: 'vamos-comemorar-next/public',
    description: 'Next.js Public Images'
  },
  {
    localPath: path.join(__dirname, '../../agilizaiapp/assets/images'),
    cloudinaryFolder: 'agilizaiapp/images',
    description: 'Flutter App Images'
  }
];

// Extensões de imagem suportadas
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif'];

// Arquivo de mapeamento gerado
const MAPPING_FILE = path.join(__dirname, '../image-mapping.json');

/**
 * Encontra todas as imagens em um diretório
 */
function findImages(directory) {
  const images = [];
  
  if (!fs.existsSync(directory)) {
    console.log(`⚠️  Diretório não encontrado: ${directory}`);
    return images;
  }

  function walkDir(dir, relativePath = '') {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const relativeFilePath = path.join(relativePath, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        walkDir(fullPath, relativeFilePath);
      } else {
        const ext = path.extname(file).toLowerCase();
        if (IMAGE_EXTENSIONS.includes(ext)) {
          images.push({
            fullPath,
            relativePath: relativeFilePath,
            fileName: file,
            extension: ext
          });
        }
      }
    }
  }
  
  walkDir(directory);
  return images;
}

/**
 * Faz upload de uma imagem para o Cloudinary
 */
async function uploadImage(imageInfo, cloudinaryFolder) {
  try {
    const fileBuffer = fs.readFileSync(imageInfo.fullPath);
    
    // Criar public_id baseado no caminho relativo (sem extensão)
    const publicId = path.join(cloudinaryFolder, imageInfo.relativePath.replace(/\.[^/.]+$/, '')).replace(/\\/g, '/');
    
    const result = await cloudinaryService.uploadFile(
      imageInfo.fileName,
      fileBuffer,
      {
        folder: cloudinaryFolder,
        publicId: publicId,
        overwrite: false
      }
    );
    
    return {
      localPath: imageInfo.relativePath,
      fullPath: imageInfo.fullPath,
      cloudinaryUrl: result.secureUrl,
      publicId: result.publicId,
      success: true
    };
  } catch (error) {
    console.error(`❌ Erro ao fazer upload de ${imageInfo.relativePath}:`, error.message);
    return {
      localPath: imageInfo.relativePath,
      fullPath: imageInfo.fullPath,
      error: error.message,
      success: false
    };
  }
}

/**
 * Função principal
 */
async function migrateAllImages() {
  console.log('🚀 Iniciando migração completa de imagens para Cloudinary...\n');
  
  // Verificar credenciais do Cloudinary
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.error('❌ Credenciais do Cloudinary não configuradas!');
    console.error('   Configure as variáveis de ambiente:');
    console.error('   - CLOUDINARY_CLOUD_NAME');
    console.error('   - CLOUDINARY_API_KEY');
    console.error('   - CLOUDINARY_API_SECRET');
    process.exit(1);
  }
  
  const allMappings = {
    nextjs: {
      assets: {},
      public: {}
    },
    flutter: {},
    metadata: {
      migratedAt: new Date().toISOString(),
      totalImages: 0,
      successful: 0,
      failed: 0
    }
  };
  
  // Processar cada diretório
  for (const dirConfig of IMAGE_DIRECTORIES) {
    console.log(`\n📁 Processando: ${dirConfig.description}`);
    console.log(`   Caminho local: ${dirConfig.localPath}`);
    console.log(`   Folder Cloudinary: ${dirConfig.cloudinaryFolder}`);
    
    const images = findImages(dirConfig.localPath);
    console.log(`   ✅ Encontradas ${images.length} imagens\n`);
    
    if (images.length === 0) {
      continue;
    }
    
    // Fazer upload de cada imagem
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      console.log(`[${i + 1}/${images.length}] 📤 Upload: ${image.relativePath}`);
      
      const result = await uploadImage(image, dirConfig.cloudinaryFolder);
      
      if (result.success) {
        allMappings.metadata.successful++;
        console.log(`   ✅ URL: ${result.cloudinaryUrl}\n`);
        
        // Organizar no mapeamento
        if (dirConfig.description.includes('Next.js App Assets')) {
          allMappings.nextjs.assets[image.relativePath] = result.cloudinaryUrl;
        } else if (dirConfig.description.includes('Next.js Public')) {
          allMappings.nextjs.public[image.relativePath] = result.cloudinaryUrl;
        } else if (dirConfig.description.includes('Flutter')) {
          allMappings.flutter[image.relativePath] = result.cloudinaryUrl;
        }
      } else {
        allMappings.metadata.failed++;
        console.log(`   ❌ Erro: ${result.error}\n`);
      }
      
      allMappings.metadata.totalImages++;
      
      // Pequeno delay para não sobrecarregar a API
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  // Salvar mapeamento
  console.log('\n💾 Salvando mapeamento...');
  fs.writeFileSync(MAPPING_FILE, JSON.stringify(allMappings, null, 2));
  console.log(`✅ Mapeamento salvo em: ${MAPPING_FILE}\n`);
  
  // Relatório final
  console.log('📊 Relatório Final:');
  console.log(`   Total de imagens: ${allMappings.metadata.totalImages}`);
  console.log(`   ✅ Sucesso: ${allMappings.metadata.successful}`);
  console.log(`   ❌ Falhas: ${allMappings.metadata.failed}`);
  console.log(`\n🎉 Migração concluída!`);
  console.log(`\n📝 Próximos passos:`);
  console.log(`   1. Revise o arquivo de mapeamento: ${MAPPING_FILE}`);
  console.log(`   2. Execute o script de atualização de referências`);
  console.log(`   3. Teste todas as páginas e funcionalidades`);
}

// Executar
if (require.main === module) {
  migrateAllImages()
    .then(() => {
      console.log('\n✅ Script finalizado com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Erro fatal:', error);
      process.exit(1);
    });
}

module.exports = { migrateAllImages };


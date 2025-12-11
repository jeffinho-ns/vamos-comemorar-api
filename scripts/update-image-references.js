/**
 * Script para Atualizar Referências de Imagens no Código
 * 
 * Este script atualiza todas as referências de imagens locais para URLs do Cloudinary
 * baseado no arquivo de mapeamento gerado pela migração.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MAPPING_FILE = path.join(__dirname, '../image-mapping.json');

// Diretórios a serem processados
const CODE_DIRECTORIES = [
  {
    path: path.join(__dirname, '../../vamos-comemorar-next'),
    type: 'nextjs',
    extensions: ['.tsx', '.ts', '.jsx', '.js', '.json']
  },
  {
    path: path.join(__dirname, '../../agilizaiapp'),
    type: 'flutter',
    extensions: ['.dart', '.yaml', '.json']
  },
  {
    path: path.join(__dirname, '..'),
    type: 'backend',
    extensions: ['.js', '.json']
  }
];

/**
 * Carrega o mapeamento de imagens
 */
function loadMapping() {
  if (!fs.existsSync(MAPPING_FILE)) {
    throw new Error(`Arquivo de mapeamento não encontrado: ${MAPPING_FILE}\nExecute primeiro o script migrate-all-images-to-cloudinary.js`);
  }
  
  return JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
}

/**
 * Cria um mapeamento reverso (URL -> caminho local) para facilitar a busca
 */
function createReverseMapping(mapping) {
  const reverse = {
    nextjs: {},
    flutter: {}
  };
  
  // Next.js assets
  for (const [localPath, cloudinaryUrl] of Object.entries(mapping.nextjs.assets)) {
    reverse.nextjs[localPath] = cloudinaryUrl;
    reverse.nextjs[`/assets/${localPath}`] = cloudinaryUrl;
    reverse.nextjs[`@/app/assets/${localPath}`] = cloudinaryUrl;
    reverse.nextjs[`app/assets/${localPath}`] = cloudinaryUrl;
  }
  
  // Next.js public
  for (const [localPath, cloudinaryUrl] of Object.entries(mapping.nextjs.public)) {
    reverse.nextjs[localPath] = cloudinaryUrl;
    reverse.nextjs[`/images/${localPath}`] = cloudinaryUrl;
    reverse.nextjs[`public/images/${localPath}`] = cloudinaryUrl;
  }
  
  // Flutter
  for (const [localPath, cloudinaryUrl] of Object.entries(mapping.flutter)) {
    reverse.flutter[localPath] = cloudinaryUrl;
    reverse.flutter[`assets/images/${localPath}`] = cloudinaryUrl;
    reverse.flutter[`images/${localPath}`] = cloudinaryUrl;
  }
  
  return reverse;
}

/**
 * Atualiza referências em um arquivo
 */
function updateFileReferences(filePath, reverseMapping, projectType) {
  const content = fs.readFileSync(filePath, 'utf8');
  let updatedContent = content;
  let changesCount = 0;
  
  const mapping = projectType === 'flutter' ? reverseMapping.flutter : reverseMapping.nextjs;
  
  // Buscar e substituir referências
  for (const [localPath, cloudinaryUrl] of Object.entries(mapping)) {
    // Padrões comuns de importação/referência
    const patterns = [
      // Import statements
      new RegExp(`from\\s+['"]@/app/assets/${localPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g'),
      new RegExp(`from\\s+['"]\\.\\.?/.*?assets/${localPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g'),
      new RegExp(`import\\s+.*?\\s+from\\s+['"].*?${localPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g'),
      
      // String literals
      new RegExp(`['"]/assets/${localPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g'),
      new RegExp(`['"]/images/${localPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g'),
      new RegExp(`['"]assets/images/${localPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g'),
      new RegExp(`['"]images/${localPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g'),
      
      // Flutter asset references
      new RegExp(`['"]assets/images/${localPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g'),
    ];
    
    for (const pattern of patterns) {
      const matches = updatedContent.match(pattern);
      if (matches) {
        updatedContent = updatedContent.replace(pattern, (match) => {
          // Preservar aspas do original
          const quote = match[0];
          const endQuote = match[match.length - 1];
          return `${quote}${cloudinaryUrl}${endQuote}`;
        });
        changesCount += matches.length;
      }
    }
  }
  
  if (changesCount > 0) {
    fs.writeFileSync(filePath, updatedContent, 'utf8');
    return changesCount;
  }
  
  return 0;
}

/**
 * Encontra todos os arquivos de código
 */
function findCodeFiles(directory, extensions) {
  const files = [];
  
  if (!fs.existsSync(directory)) {
    return files;
  }
  
  function walkDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      // Ignorar node_modules, .git, build, etc.
      if (entry.name.startsWith('.') || 
          entry.name === 'node_modules' || 
          entry.name === 'build' ||
          entry.name === 'dist' ||
          entry.name === '.next') {
        continue;
      }
      
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }
  
  walkDir(directory);
  return files;
}

/**
 * Função principal
 */
async function updateReferences() {
  console.log('🔄 Iniciando atualização de referências de imagens...\n');
  
  const mapping = loadMapping();
  const reverseMapping = createReverseMapping(mapping);
  
  console.log(`📊 Mapeamento carregado:`);
  console.log(`   Next.js assets: ${Object.keys(mapping.nextjs.assets).length}`);
  console.log(`   Next.js public: ${Object.keys(mapping.nextjs.public).length}`);
  console.log(`   Flutter: ${Object.keys(mapping.flutter).length}\n`);
  
  let totalFiles = 0;
  let totalChanges = 0;
  
  // Processar cada diretório
  for (const dirConfig of CODE_DIRECTORIES) {
    console.log(`\n📁 Processando: ${dirConfig.type}`);
    console.log(`   Caminho: ${dirConfig.path}`);
    
    const files = findCodeFiles(dirConfig.path, dirConfig.extensions);
    console.log(`   ✅ Encontrados ${files.length} arquivos\n`);
    
    for (const file of files) {
      const changes = updateFileReferences(file, reverseMapping, dirConfig.type);
      if (changes > 0) {
        console.log(`   ✏️  ${path.relative(dirConfig.path, file)}: ${changes} alterações`);
        totalChanges += changes;
      }
      totalFiles++;
    }
  }
  
  console.log(`\n📊 Relatório Final:`);
  console.log(`   Arquivos processados: ${totalFiles}`);
  console.log(`   Total de alterações: ${totalChanges}`);
  console.log(`\n✅ Atualização concluída!`);
  console.log(`\n⚠️  IMPORTANTE: Revise as alterações antes de fazer commit!`);
  console.log(`   Use: git diff para ver todas as mudanças`);
}

// Executar
if (require.main === module) {
  updateReferences()
    .then(() => {
      console.log('\n✅ Script finalizado com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Erro fatal:', error);
      process.exit(1);
    });
}

module.exports = { updateReferences };


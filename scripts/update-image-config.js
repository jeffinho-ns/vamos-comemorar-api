/**
 * Script para atualizar imageConfig.ts com URLs reais do Cloudinary
 */

const fs = require('fs');
const path = require('path');

const MAPPING_FILE = path.join(__dirname, '../image-mapping.json');
const CONFIG_FILE = path.join(__dirname, '../../vamos-comemorar-next/lib/imageConfig.ts');

// Carregar mapeamento
const mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));

// Criar objeto de mapeamento simplificado
const imageMap = {};

// Next.js assets
for (const [localPath, cloudinaryUrl] of Object.entries(mapping.nextjs.assets)) {
  imageMap[localPath] = cloudinaryUrl;
}

// Next.js public
for (const [localPath, cloudinaryUrl] of Object.entries(mapping.nextjs.public)) {
  imageMap[`images/${localPath}`] = cloudinaryUrl;
}

// Gerar conteúdo do arquivo
let configContent = `/**
 * Configuração Centralizada de Imagens
 * 
 * Este arquivo mapeia todos os caminhos locais de imagens para URLs do Cloudinary.
 * Gerado automaticamente pelo script de migração.
 * Última atualização: ${new Date().toISOString()}
 */

// Mapeamento de imagens locais para URLs do Cloudinary
// Formato: 'caminho/local/imagem.jpg' => 'url-completa-cloudinary'
export const imageMap: Record<string, string> = {
`;

// Ordenar por chave para melhor organização
const sortedKeys = Object.keys(imageMap).sort();

for (const key of sortedKeys) {
  const url = imageMap[key];
  configContent += `  '${key}': '${url}',\n`;
}

configContent += `};

/**
 * Obtém a URL do Cloudinary para uma imagem local
 * @param localPath - Caminho local da imagem (ex: 'highline/capa-highline.jpeg')
 * @returns URL do Cloudinary ou null se não encontrado
 */
export function getCloudinaryUrl(localPath: string): string | null {
  // Normalizar caminho (remover @/app/assets/, /assets/, etc)
  const normalized = localPath
    .replace(/^@\/app\/assets\//, '')
    .replace(/^\/app\/assets\//, '')
    .replace(/^app\/assets\//, '')
    .replace(/^\/assets\//, '')
    .replace(/^assets\//, '')
    .replace(/^\/images\//, 'images/')
    .replace(/^\/agilizai\//, 'agilizai/');
  
  return imageMap[normalized] || null;
}

/**
 * Obtém a URL da imagem (Cloudinary ou fallback para local)
 * @param localPath - Caminho local da imagem
 * @param fallback - URL ou caminho de fallback
 * @returns URL da imagem
 */
export function getImageUrl(localPath: string, fallback?: string): string {
  const cloudinaryUrl = getCloudinaryUrl(localPath);
  if (cloudinaryUrl) {
    return cloudinaryUrl;
  }
  
  // Se não encontrado no Cloudinary, usar fallback ou caminho local
  if (fallback) {
    return fallback.startsWith('http') ? fallback : \`/\${fallback}\`;
  }
  
  // Fallback padrão
  return localPath.startsWith('http') ? localPath : \`/\${localPath}\`;
}
`;

// Salvar arquivo
fs.writeFileSync(CONFIG_FILE, configContent, 'utf8');

console.log('✅ Arquivo imageConfig.ts atualizado com sucesso!');
console.log(`   Total de imagens mapeadas: ${sortedKeys.length}`);
console.log(`   Arquivo: ${CONFIG_FILE}`);


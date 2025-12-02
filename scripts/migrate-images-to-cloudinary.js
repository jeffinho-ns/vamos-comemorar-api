/**
 * Script de Migração de Imagens: FTP Hostinger → Cloudinary
 * 
 * Este script migra todas as imagens armazenadas no FTP da Hostinger
 * para o Cloudinary.
 * 
 * IMPORTANTE:
 * - Este é um script de uso único para migração pontual
 * - NÃO faz parte do código de deploy da API
 * - Execute manualmente após configurar as variáveis de ambiente
 * - Faça backup do banco de dados antes de executar
 * 
 * Fluxo:
 * 1. Identifica todos os registros com URLs do FTP
 * 2. Conecta ao FTP e faz download de cada arquivo
 * 3. Faz upload para o Cloudinary
 * 4. Obtém URL pública do Cloudinary
 * 5. Atualiza o banco de dados com a nova URL
 * 
 * Uso:
 *   node scripts/migrate-images-to-cloudinary.js
 */

require('dotenv').config();
const pool = require('../config/database');
const ftp = require('basic-ftp');
const cloudinaryService = require('../services/cloudinaryService');

// Configurações FTP (para download das imagens antigas)
const FTP_CONFIG = {
  host: process.env.FTP_HOST || '195.35.41.247',
  user: process.env.FTP_USER || 'u621081794',
  password: process.env.FTP_PASSWORD || 'Jeffl1ma!@',
  secure: false,
  port: 21,
  remoteDirectory: process.env.FTP_ROOT_PATH || '/public_html/cardapio-agilizaiapp/',
};

// URL base antiga do FTP (para identificar URLs que precisam ser migradas)
const OLD_FTP_BASE_URL = 'https://grupoideiaum.com.br/cardapio-agilizaiapp/';
const OLD_FTP_BASE_URL_ALT = 'http://grupoideiaum.com.br/cardapio-agilizaiapp/';

// Estatísticas da migração
const stats = {
  total: 0,
  success: 0,
  failed: 0,
  skipped: 0,
  errors: []
};

/**
 * Extrai o nome do arquivo de uma URL do FTP
 */
function extractFilenameFromUrl(url) {
  if (!url) return null;
  
  const urlStr = String(url).trim();
  
  // Se já é apenas um nome de arquivo (sem http/https)
  if (!urlStr.includes('http') && !urlStr.includes('/')) {
    return urlStr;
  }
  
  // Remove a URL base do FTP
  let filename = urlStr
    .replace(OLD_FTP_BASE_URL, '')
    .replace(OLD_FTP_BASE_URL_ALT, '')
    .replace(/^\/+/, ''); // Remove barras iniciais
  
  // Se ainda contém caminho, pega apenas o nome do arquivo
  if (filename.includes('/')) {
    filename = filename.split('/').pop();
  }
  
  return filename || null;
}

/**
 * Faz download de um arquivo do FTP
 */
async function downloadFromFTP(filename) {
  const client = new ftp.Client();
  client.ftp.verbose = false;
  
  try {
    await client.access({
      host: FTP_CONFIG.host,
      user: FTP_CONFIG.user,
      password: FTP_CONFIG.password,
      secure: FTP_CONFIG.secure,
      port: FTP_CONFIG.port
    });
    
    const remotePath = FTP_CONFIG.remoteDirectory.replace(/\/+$/, '') + '/' + filename;
    const chunks = [];
    
    await client.downloadTo((chunk) => {
      chunks.push(chunk);
    }, remotePath);
    
    client.close();
    
    const buffer = Buffer.concat(chunks);
    console.log(`   ✅ Download do FTP: ${filename} (${buffer.length} bytes)`);
    
    return buffer;
  } catch (error) {
    client.close();
    throw new Error(`Erro ao fazer download do FTP: ${error.message}`);
  }
}

/**
 * Migra uma URL de imagem do FTP para o Cloudinary
 */
async function migrateImageUrl(oldUrl, tableName, columnName, recordId) {
  try {
    const filename = extractFilenameFromUrl(oldUrl);
    
    if (!filename) {
      console.log(`   ⚠️ Não foi possível extrair nome do arquivo de: ${oldUrl}`);
      stats.skipped++;
      return null;
    }
    
    // Verifica se a URL já é do Cloudinary (para evitar re-migração)
    if (oldUrl && (oldUrl.includes('cloudinary.com') || oldUrl.includes('res.cloudinary.com'))) {
      console.log(`   ⏭️ URL já é do Cloudinary, pulando: ${oldUrl}`);
      stats.skipped++;
      return oldUrl;
    }
    
    console.log(`   📥 Fazendo download do FTP: ${filename}`);
    const fileBuffer = await downloadFromFTP(filename);
    
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error('Arquivo vazio ou não encontrado no FTP');
    }
    
    console.log(`   📤 Fazendo upload para Cloudinary: ${filename}`);
    const newUrl = await cloudinaryService.uploadFileAndGetPublicUrl(filename, fileBuffer, {
      folder: 'cardapio-agilizaiapp',
      overwrite: false
    });
    
    console.log(`   ✅ Migração concluída: ${oldUrl} → ${newUrl}`);
    
    return newUrl;
  } catch (error) {
    console.error(`   ❌ Erro na migração: ${error.message}`);
    stats.errors.push({
      table: tableName,
      column: columnName,
      recordId: recordId,
      oldUrl: oldUrl,
      error: error.message
    });
    throw error;
  }
}

/**
 * Migra imagens da tabela cardapio_images
 */
async function migrateCardapioImages() {
  console.log('\n📋 Migrando tabela: cardapio_images');
  
  try {
    const result = await pool.query(`
      SELECT id, url, filename 
      FROM cardapio_images 
      WHERE url LIKE $1 OR url LIKE $2
      ORDER BY id
    `, [`${OLD_FTP_BASE_URL}%`, `${OLD_FTP_BASE_URL_ALT}%`]);
    
    console.log(`   Encontrados ${result.rows.length} registros para migrar`);
    stats.total += result.rows.length;
    
    for (const row of result.rows) {
      try {
        const newUrl = await migrateImageUrl(row.url, 'cardapio_images', 'url', row.id);
        
        if (newUrl) {
          await pool.query(
            'UPDATE cardapio_images SET url = $1 WHERE id = $2',
            [newUrl, row.id]
          );
          stats.success++;
        }
      } catch (error) {
        stats.failed++;
        console.error(`   ❌ Falha ao migrar registro ID ${row.id}: ${error.message}`);
      }
    }
  } catch (error) {
    console.error(`❌ Erro ao processar cardapio_images: ${error.message}`);
  }
}

/**
 * Migra imagens da tabela menu_items
 */
async function migrateMenuItems() {
  console.log('\n📋 Migrando tabela: menu_items');
  
  try {
    const result = await pool.query(`
      SELECT id, imageurl 
      FROM menu_items 
      WHERE imageurl IS NOT NULL 
        AND imageurl != ''
        AND (imageurl LIKE $1 OR imageurl LIKE $2)
      ORDER BY id
    `, [`${OLD_FTP_BASE_URL}%`, `${OLD_FTP_BASE_URL_ALT}%`]);
    
    console.log(`   Encontrados ${result.rows.length} registros para migrar`);
    stats.total += result.rows.length;
    
    for (const row of result.rows) {
      try {
        const newUrl = await migrateImageUrl(row.imageurl, 'menu_items', 'imageurl', row.id);
        
        if (newUrl) {
          await pool.query(
            'UPDATE menu_items SET imageurl = $1 WHERE id = $2',
            [newUrl, row.id]
          );
          stats.success++;
        }
      } catch (error) {
        stats.failed++;
        console.error(`   ❌ Falha ao migrar registro ID ${row.id}: ${error.message}`);
      }
    }
  } catch (error) {
    console.error(`❌ Erro ao processar menu_items: ${error.message}`);
  }
}

/**
 * Migra imagens da tabela bars
 */
async function migrateBars() {
  console.log('\n📋 Migrando tabela: bars');
  
  const columns = [
    { name: 'logourl', label: 'logoUrl' },
    { name: 'coverimageurl', label: 'coverImageUrl' },
    { name: 'popupimageurl', label: 'popupImageUrl' }
  ];
  
  for (const col of columns) {
    try {
      const result = await pool.query(`
        SELECT id, ${col.name}
        FROM bars 
        WHERE ${col.name} IS NOT NULL 
          AND ${col.name} != ''
          AND (${col.name} LIKE $1 OR ${col.name} LIKE $2)
        ORDER BY id
      `, [`${OLD_FTP_BASE_URL}%`, `${OLD_FTP_BASE_URL_ALT}%`]);
      
      console.log(`   Encontrados ${result.rows.length} registros para migrar (${col.label})`);
      stats.total += result.rows.length;
      
      for (const row of result.rows) {
        try {
          const oldUrl = row[col.name];
          const newUrl = await migrateImageUrl(oldUrl, 'bars', col.name, row.id);
          
          if (newUrl) {
            await pool.query(
              `UPDATE bars SET ${col.name} = $1 WHERE id = $2`,
              [newUrl, row.id]
            );
            stats.success++;
          }
        } catch (error) {
          stats.failed++;
          console.error(`   ❌ Falha ao migrar registro ID ${row.id} (${col.label}): ${error.message}`);
        }
      }
    } catch (error) {
      console.error(`❌ Erro ao processar bars.${col.name}: ${error.message}`);
    }
  }
}

/**
 * Migra imagens da tabela users
 */
async function migrateUsers() {
  console.log('\n📋 Migrando tabela: users');
  
  try {
    const result = await pool.query(`
      SELECT id, foto_perfil 
      FROM users 
      WHERE foto_perfil IS NOT NULL 
        AND foto_perfil != ''
        AND (foto_perfil LIKE $1 OR foto_perfil LIKE $2)
      ORDER BY id
    `, [`${OLD_FTP_BASE_URL}%`, `${OLD_FTP_BASE_URL_ALT}%`]);
    
    console.log(`   Encontrados ${result.rows.length} registros para migrar`);
    stats.total += result.rows.length;
    
    for (const row of result.rows) {
      try {
        const newUrl = await migrateImageUrl(row.foto_perfil, 'users', 'foto_perfil', row.id);
        
        if (newUrl) {
          await pool.query(
            'UPDATE users SET foto_perfil = $1 WHERE id = $2',
            [newUrl, row.id]
          );
          stats.success++;
        }
      } catch (error) {
        stats.failed++;
        console.error(`   ❌ Falha ao migrar registro ID ${row.id}: ${error.message}`);
      }
    }
  } catch (error) {
    console.error(`❌ Erro ao processar users: ${error.message}`);
  }
}

/**
 * Migra imagens da tabela eventos
 */
async function migrateEventos() {
  console.log('\n📋 Migrando tabela: eventos');
  
  const columns = [
    { name: 'imagem_do_evento', label: 'imagem_do_evento' },
    { name: 'imagem_do_combo', label: 'imagem_do_combo' }
  ];
  
  for (const col of columns) {
    try {
      const result = await pool.query(`
        SELECT id, ${col.name}
        FROM eventos 
        WHERE ${col.name} IS NOT NULL 
          AND ${col.name} != ''
          AND (${col.name} LIKE $1 OR ${col.name} LIKE $2)
        ORDER BY id
      `, [`${OLD_FTP_BASE_URL}%`, `${OLD_FTP_BASE_URL_ALT}%`]);
      
      console.log(`   Encontrados ${result.rows.length} registros para migrar (${col.label})`);
      stats.total += result.rows.length;
      
      for (const row of result.rows) {
        try {
          const oldUrl = row[col.name];
          const newUrl = await migrateImageUrl(oldUrl, 'eventos', col.name, row.id);
          
          if (newUrl) {
            await pool.query(
              `UPDATE eventos SET ${col.name} = $1 WHERE id = $2`,
              [newUrl, row.id]
            );
            stats.success++;
          }
        } catch (error) {
          stats.failed++;
          console.error(`   ❌ Falha ao migrar registro ID ${row.id} (${col.label}): ${error.message}`);
        }
      }
    } catch (error) {
      console.error(`❌ Erro ao processar eventos.${col.name}: ${error.message}`);
    }
  }
}

/**
 * Migra imagens da tabela promoters
 */
async function migratePromoters() {
  console.log('\n📋 Migrando tabela: promoters');
  
  try {
    const result = await pool.query(`
      SELECT id, foto_url 
      FROM promoters 
      WHERE foto_url IS NOT NULL 
        AND foto_url != ''
        AND (foto_url LIKE $1 OR foto_url LIKE $2)
      ORDER BY id
    `, [`${OLD_FTP_BASE_URL}%`, `${OLD_FTP_BASE_URL_ALT}%`]);
    
    console.log(`   Encontrados ${result.rows.length} registros para migrar`);
    stats.total += result.rows.length;
    
    for (const row of result.rows) {
      try {
        const newUrl = await migrateImageUrl(row.foto_url, 'promoters', 'foto_url', row.id);
        
        if (newUrl) {
          await pool.query(
            'UPDATE promoters SET foto_url = $1 WHERE id = $2',
            [newUrl, row.id]
          );
          stats.success++;
        }
      } catch (error) {
        stats.failed++;
        console.error(`   ❌ Falha ao migrar registro ID ${row.id}: ${error.message}`);
      }
    }
  } catch (error) {
    console.error(`❌ Erro ao processar promoters: ${error.message}`);
  }
}

/**
 * Função principal de migração
 */
async function runMigration() {
  console.log('🚀 Iniciando migração de imagens: FTP → Cloudinary');
  console.log('='.repeat(60));
  console.log(`📅 Data/Hora: ${new Date().toISOString()}`);
  console.log(`🔧 Configurações:`);
  console.log(`   FTP Host: ${FTP_CONFIG.host}`);
  console.log(`   FTP Directory: ${FTP_CONFIG.remoteDirectory}`);
  console.log(`   Cloudinary Cloud Name: ${process.env.CLOUDINARY_CLOUD_NAME ? '✅ Configurado' : '❌ Não configurado'}`);
  console.log('='.repeat(60));
  
  const startTime = Date.now();
  
  try {
    // Testa conexão com o banco
    await pool.query('SELECT 1');
    console.log('✅ Conexão com banco de dados estabelecida');
    
    // Testa Cloudinary
    try {
      if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        throw new Error('Credenciais do Cloudinary não configuradas');
      }
      console.log('✅ Configuração Cloudinary OK');
    } catch (error) {
      console.error('❌ Erro na configuração Cloudinary:', error.message);
      console.error('   Verifique as variáveis de ambiente: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
      process.exit(1);
    }
    
    // Executa migrações por tabela
    await migrateCardapioImages();
    await migrateMenuItems();
    await migrateBars();
    await migrateUsers();
    await migrateEventos();
    await migratePromoters();
    
    // Relatório final
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 RELATÓRIO FINAL DA MIGRAÇÃO');
    console.log('='.repeat(60));
    console.log(`✅ Sucessos: ${stats.success}`);
    console.log(`❌ Falhas: ${stats.failed}`);
    console.log(`⏭️  Pulados: ${stats.skipped}`);
    console.log(`📊 Total processado: ${stats.total}`);
    console.log(`⏱️  Tempo total: ${duration}s`);
    
    if (stats.errors.length > 0) {
      console.log('\n⚠️  ERROS DETALHADOS:');
      stats.errors.forEach((error, index) => {
        console.log(`\n${index + 1}. ${error.table}.${error.column} (ID: ${error.recordId})`);
        console.log(`   URL antiga: ${error.oldUrl}`);
        console.log(`   Erro: ${error.error}`);
      });
    }
    
    console.log('\n✅ Migração concluída!');
    
  } catch (error) {
    console.error('\n❌ ERRO CRÍTICO NA MIGRAÇÃO:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('\n🔌 Conexões fechadas');
  }
}

// Executa a migração
if (require.main === module) {
  runMigration().catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
}

module.exports = { runMigration };


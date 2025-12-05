/**
 * Script para verificar quais URLs FTP ainda estão sendo usadas no banco de dados
 * 
 * Este script verifica todas as tabelas que podem conter URLs de imagens
 * e identifica quais ainda apontam para o FTP antigo.
 * 
 * Uso:
 *   node scripts/check-ftp-urls-usage.js
 */

require('dotenv').config();
const pool = require('../config/database');

const OLD_FTP_BASE_URL = 'https://grupoideiaum.com.br/cardapio-agilizaiapp/';
const OLD_FTP_BASE_URL_ALT = 'http://grupoideiaum.com.br/cardapio-agilizaiapp/';
const OLD_FTP_BASE_URL_WWW = 'https://www.grupoideiaum.com.br/cardapio-agilizaiapp/';

async function checkTable(tableName, columns) {
  const results = {
    table: tableName,
    total: 0,
    ftpUrls: [],
    cloudinaryUrls: 0,
    otherUrls: 0,
    nullOrEmpty: 0
  };

  try {
    for (const column of columns) {
      const query = `SELECT id, ${column} as url_value FROM ${tableName} WHERE ${column} IS NOT NULL AND ${column} != ''`;
      const result = await pool.query(query);

      for (const row of result.rows) {
        results.total++;
        const url = String(row.url_value).trim();

        if (!url || url === 'null' || url === 'undefined') {
          results.nullOrEmpty++;
          continue;
        }

        if (url.includes('cloudinary.com') || url.includes('res.cloudinary.com')) {
          results.cloudinaryUrls++;
        } else if (
          url.includes(OLD_FTP_BASE_URL) ||
          url.includes(OLD_FTP_BASE_URL_ALT) ||
          url.includes(OLD_FTP_BASE_URL_WWW) ||
          url.includes('grupoideiaum.com.br/cardapio-agilizaiapp')
        ) {
          results.ftpUrls.push({
            id: row.id,
            column: column,
            url: url
          });
        } else {
          results.otherUrls++;
        }
      }
    }
  } catch (error) {
    console.error(`❌ Erro ao verificar tabela ${tableName}:`, error.message);
  }

  return results;
}

async function main() {
  console.log('🔍 Verificando URLs FTP ainda em uso no banco de dados...\n');
  console.log('='.repeat(60));

  try {
    // Verificar conexão
    await pool.query('SELECT 1');
    console.log('✅ Conexão com banco de dados estabelecida\n');

    // Tabelas e colunas para verificar
    const tablesToCheck = [
      { name: 'cardapio_images', columns: ['url'] },
      { name: 'eventos', columns: ['imagem_do_evento', 'imagem_do_combo'] },
      { name: 'users', columns: ['foto_perfil'] },
      { name: 'bars', columns: ['logourl', 'coverimageurl', 'popupimageurl'] },
      { name: 'menu_items', columns: ['imageurl'] },
      { name: 'promoters', columns: ['foto_url'] }
    ];

    const allResults = [];
    let totalFtpUrls = 0;

    for (const table of tablesToCheck) {
      const result = await checkTable(table.name, table.columns);
      allResults.push(result);
      totalFtpUrls += result.ftpUrls.length;
    }

    // Exibir resultados
    console.log('\n📊 RESUMO POR TABELA:\n');
    for (const result of allResults) {
      if (result.total > 0 || result.ftpUrls.length > 0) {
        console.log(`📋 Tabela: ${result.table}`);
        console.log(`   Total de registros com URLs: ${result.total}`);
        console.log(`   ✅ URLs Cloudinary: ${result.cloudinaryUrls}`);
        console.log(`   ⚠️  URLs FTP: ${result.ftpUrls.length}`);
        console.log(`   🔗 Outras URLs: ${result.otherUrls}`);
        console.log(`   ❌ Null/Vazias: ${result.nullOrEmpty}`);
        
        if (result.ftpUrls.length > 0) {
          console.log(`\n   📝 URLs FTP encontradas:`);
          result.ftpUrls.slice(0, 5).forEach(item => {
            console.log(`      - ID ${item.id} (${item.column}): ${item.url.substring(0, 80)}...`);
          });
          if (result.ftpUrls.length > 5) {
            console.log(`      ... e mais ${result.ftpUrls.length - 5} URLs FTP`);
          }
        }
        console.log('');
      }
    }

    console.log('='.repeat(60));
    console.log('\n📊 RESUMO GERAL:\n');
    console.log(`⚠️  Total de URLs FTP ainda em uso: ${totalFtpUrls}`);
    
    if (totalFtpUrls === 0) {
      console.log('✅ Nenhuma URL FTP encontrada! Todas as imagens foram migradas para Cloudinary.');
      console.log('✅ É seguro excluir os arquivos do FTP antigo.');
    } else {
      console.log(`⚠️  Ainda há ${totalFtpUrls} URLs FTP no banco de dados.`);
      console.log('⚠️  Recomendação: Migrar essas URLs antes de excluir os arquivos do FTP.');
    }

    // Gerar relatório detalhado
    if (totalFtpUrls > 0) {
      console.log('\n📄 Gerando relatório detalhado...');
      const detailedReport = allResults
        .filter(r => r.ftpUrls.length > 0)
        .map(r => ({
          table: r.table,
          urls: r.ftpUrls
        }));

      console.log('\n📋 RELATÓRIO DETALHADO:');
      detailedReport.forEach(report => {
        console.log(`\n📁 Tabela: ${report.table}`);
        report.urls.forEach(item => {
          console.log(`   ID ${item.id} | ${item.column}: ${item.url}`);
        });
      });
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
    console.log('\n🔌 Conexão fechada');
  }
}

main();





const QRCode = require('qrcode');

// A função agora recebe o 'pool' como o primeiro argumento
function generateQRCode(pool, id) {
  // Retornamos uma Promise para que possamos usar 'await' na rota que chama esta função
  return new Promise(async (resolve, reject) => {
    try {
      // 1. Gera o conteúdo e a imagem do QR Code (esta parte não muda)
      const qrCodeText = `https://vamos-comemorar.com/validar-reserva/${id}`;
      const qrCodeBase64 = await QRCode.toDataURL(qrCodeText);

      const sql = 'UPDATE reservas SET qrcode = ? WHERE id = ?';
      const params = [qrCodeBase64, id];

      // 2. Executa a query usando o padrão de callback, que é compatível com seu 'pool'
      pool.query(sql, params, (error, results) => {
        if (error) {
          // Se o banco de dados retornar um erro, nós rejeitamos a Promise
          console.error('Erro ao salvar o QR Code no banco:', error);
          return reject(error);
        }
        
        // Se a query for bem-sucedida, nós resolvemos a Promise
        console.log(`QR Code salvo com sucesso no banco para reserva ID: ${id}`);
        resolve(results);
      });

    } catch (error) {
      // Captura erros da geração do QR Code (ex: QRCode.toDataURL)
      console.error('Erro ao gerar a imagem do QR Code:', error);
      reject(error);
    }
  });
}

module.exports = generateQRCode;
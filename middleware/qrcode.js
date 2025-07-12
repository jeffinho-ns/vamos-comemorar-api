const QRCode = require('qrcode');

// A função agora recebe o 'pool' como o primeiro argumento
function generateQRCode(pool, id) {
  // Retornamos uma Promise para que possamos usar 'await' na rota que chama esta função
  return new Promise(async (resolve, reject) => {
    try {
      // 1. Define o CONTEÚDO que o QR Code deve representar.
      // Esta é a string que será scaneada pelo leitor de QR Code.
      const qrCodeText = `https://vamos-comemorar.com/validar-reserva/${id}`;
      
      // >>> REMOVIDO: const qrCodeBase64 = await QRCode.toDataURL(qrCodeText); <<<
      // Você não precisa gerar a imagem Base64 AQUI e salvar no banco.
      // O Flutter QrImageView vai gerar a imagem a partir de qrCodeText.

      const sql = 'UPDATE reservas SET qrcode = ? WHERE id = ?';
      // 2. Salva o CONTEÚDO (qrCodeText) na coluna 'qrcode' do banco de dados.
      const params = [qrCodeText, id]; // <<< ALTERADO AQUI: Passa qrCodeText, não qrCodeBase64

      // 3. Executa a query usando o padrão de callback, que é compatível com seu 'pool'
      pool.query(sql, params, (error, results) => {
        if (error) {
          // Se o banco de dados retornar um erro, nós rejeitamos a Promise
          console.error('Erro ao salvar o CONTEÚDO do QR Code no banco:', error);
          return reject(error);
        }
        
        // Se a query for bem-sucedida, nós resolvemos a Promise
        console.log(`CONTEÚDO do QR Code salvo com sucesso no banco para reserva ID: ${id}`);
        resolve(results);
      });

    } catch (error) {
      // Captura erros gerais (ex: problemas no pool.query se não forem específicos)
      console.error('Erro ao processar a geração/salvamento do QR Code:', error);
      reject(error);
    }
  });
}

module.exports = generateQRCode;
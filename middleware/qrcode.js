const QRCode = require('qrcode');
// Importe o 'pool' que você já usa nos outros arquivos, em vez de 'db'
const pool = require('../config/database'); 

// A função só precisa do 'id'
async function generateQRCode(id) {
    try {
        // O conteúdo do QR Code deve ser algo único. Uma URL para validar a reserva é o ideal.
        const qrCodeText = `https://seusite.com/validar-reserva/${id}`;

        const qrCodeBase64 = await QRCode.toDataURL(qrCodeText);

        // Usando o 'pool' importado
        await pool.promise().query('UPDATE reservas SET qrcode = ? WHERE id = ?', [qrCodeBase64, id]);

        console.log(`QR Code gerado e salvo como base64 para a reserva ID: ${id}`);
    } catch (error) {
        console.error('Erro ao gerar o QR Code:', error);
        // ---- CORREÇÃO AQUI ----
        // Relance o erro para que a rota que chamou esta função saiba que algo deu errado.
        throw error;
    }
}

module.exports = generateQRCode;
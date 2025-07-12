const QRCode = require('qrcode');

function generateQRCode(pool, reservationId) {
  return new Promise(async (resolve, reject) => {
    try {
      // 1. Buscar os dados completos da reserva do banco de dados
      const [reservaRows] = await pool.query('SELECT * FROM reservas WHERE id = ?', [reservationId]);
      const reserva = reservaRows[0];

      if (!reserva) {
        console.error(`Erro: Reserva com ID ${reservationId} não encontrada para gerar QR Code.`);
        return reject(new Error('Reserva não encontrada.'));
      }

      // 2. Definir o CONTEÚDO JSON que o QR Code deve representar.
      // Use os dados buscados da reserva.
      const qrCodeData = {
        reservaId: reserva.id,
        userId: reserva.user_id,
        eventId: reserva.event_id, // Pode ser null
        nomeDoEvento: reserva.nome_do_evento,
        dataDoEvento: reserva.data_do_evento,
        horaDoEvento: reserva.hora_do_evento,
        localDoEvento: reserva.local_do_evento,
        casaDaReserva: reserva.casa_da_reserva,
        quantidadePessoas: reserva.quantidade_pessoas,
        mesas: reserva.mesas,
        status: reserva.status,
        userName: reserva.name, // 'name' do usuário copiado para a reserva
        userEmail: reserva.email, // 'email' do usuário copiado para a reserva
        // Adicione outros campos que você copiou para a tabela 'reservas' e que são relevantes
      };

      // 3. Converter o objeto JSON em uma string.
      const qrCodeText = JSON.stringify(qrCodeData);
      
      // Opcional: Para visualização em DEBUG, você pode querer ver a imagem
      // const qrCodeBase64 = await QRCode.toDataURL(qrCodeText);
      // console.log("QR Code Base64 (para debug visual, não salvar no banco):", qrCodeBase64.substring(0, 100) + "...");

      // 4. Salvar esta STRING JSON na coluna 'qrcode' do banco de dados.
      const sql = 'UPDATE reservas SET qrcode = ? WHERE id = ?';
      const params = [qrCodeText, reservationId]; // Salva o JSON como string

      // 5. Executar a query
      pool.query(sql, params, (error, results) => {
        if (error) {
          console.error('Erro ao salvar o CONTEÚDO JSON do QR Code no banco:', error);
          return reject(error);
        }
        console.log(`CONTEÚDO JSON do QR Code salvo com sucesso no banco para reserva ID: ${reservationId}`);
        resolve(results);
      });

    } catch (error) {
      console.error('Erro ao gerar/salvar o CONTEÚDO JSON do QR Code:', error);
      reject(error);
    }
  });
}

module.exports = generateQRCode;
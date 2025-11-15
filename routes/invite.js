// Em routes/invite.js

const express = require('express');
const router = express.Router();
const { customAlphabet } = require('nanoid');

module.exports = (pool) => {
  /**
   * @route   POST /convite/:codigo
   * @desc    Permite que um convidado se adicione a uma reserva através de um código de convite.
   * @access  Public
   */
  router.post('/:codigo', async (req, res) => {
    const codigoConvite = req.params.codigo;
    const { nome, email, telefone } = req.body;
    const io = req.app.get('socketio'); // Pega a instância do Socket.IO

    if (!nome || !email) {
      return res.status(400).json({ message: 'Nome e e-mail são obrigatórios.' });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Encontra a reserva pelo código e a "trava" para evitar que duas pessoas se inscrevam ao mesmo tempo na última vaga (FOR UPDATE)
      const sqlBuscaReserva = 'SELECT id, quantidade_convidados FROM reservas WHERE codigo_convite = $1 FOR UPDATE';
      const reservaResult = await client.query(sqlBuscaReserva, [codigoConvite]);

      if (reservaResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Código de convite inválido ou expirado.' });
      }
      
      const reserva = reservaResult.rows[0];
      const reservaId = reserva.id;
      
      // 2. Verifica se a lista já está cheia
      const sqlContaConvidados = 'SELECT COUNT(*) as total FROM convidados WHERE reserva_id = $1';
      const countResult = await client.query(sqlContaConvidados, [reservaId]);
      const convidadosAtuais = parseInt(countResult.rows[0].total);

      if (convidadosAtuais >= reserva.quantidade_convidados) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'A lista para este convite já está cheia!' });
      }

      // 3. Adiciona o novo convidado
      const qrCodeDataConvidado = `reserva:${reservaId}:convidado:${nome.replace(/\s/g, '')}:${Date.now()}`;
      const sqlAdicionaConvidado = 'INSERT INTO convidados (reserva_id, nome, email, telefone, qr_code, status) VALUES ($1, $2, $3, $4, $5, $6)';
      
      await client.query(sqlAdicionaConvidado, [
        reservaId, nome, email, telefone || null, qrCodeDataConvidado, 'PENDENTE'
      ]);

      await client.query('COMMIT'); // Confirma as alterações

      const novoConvidado = { nome, email, status: 'PENDENTE' };

      // 4. Emite um evento em tempo real para o criador da lista
      io.to(`reserva_${reservaId}`).emit('novo_convidado_adicionado', novoConvidado);
      
      // 5. Retorna o sucesso e o QR Code para o convidado que se inscreveu
      res.status(201).json({
        message: `Você foi adicionado à lista com sucesso, ${nome}!`,
        qrCode: qrCodeDataConvidado
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro ao processar convite:', error);
      res.status(500).json({ message: 'Erro ao processar sua entrada na lista.' });
    } finally {
      if (client) client.release();
    }
  });

  return router;
};
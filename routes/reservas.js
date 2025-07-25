// Em /routes/reservas.js
// VERSÃO INTEGRADA E ADAPTADA

const express = require('express');


module.exports = (pool) => {
    const router = express.Router();
    const qrcode = require('qrcode'); // Usaremos para a nova lógica

    // ==========================================================================================
    // ROTA DE CRIAÇÃO (POST /) - ADAPTADA PARA A NOVA LÓGICA UNIFICADA
    // Esta rota agora substitui a lógica das suas duas rotas POST antigas.
    // Ela é mais inteligente e lida com todos os tipos de reserva.
    // ==========================================================================================
router.post('/', async (req, res) => {
    // O front-end agora envia a quantidade, não os nomes
    const { 
        userId, tipoReserva, nomeLista, dataReserva, eventoId, quantidadeConvidados, brindes 
    } = req.body;
    const { customAlphabet } = await import('nanoid');  
    // Gerador de código customizado: 6 caracteres, letras maiúsculas e números
    const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);
    const codigoConvite = nanoid();

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Inserir a reserva principal com a quantidade e o código do convite
        const sqlReserva = 'INSERT INTO reservas (user_id, tipo_reserva, nome_lista, data_reserva, evento_id, quantidade_convidados, codigo_convite) VALUES (?, ?, ?, ?, ?, ?, ?)';
        const [reservaResult] = await connection.execute(sqlReserva, [
            userId, tipoReserva, nomeLista, dataReserva, eventoId, quantidadeConvidados, codigoConvite
        ]);
        const reservaId = reservaResult.insertId;

        // 2. Inserir o CRIADOR como o primeiro convidado
        // Primeiro, buscamos o nome do criador na tabela de usuários
        const [[user]] = await connection.query('SELECT name FROM users WHERE id = ?', [userId]);
        if (!user) throw new Error('Usuário criador não encontrado.');
        
        const qrCodeDataCriador = `reserva:${reservaId}:convidado:${user.name.replace(/\s/g, '')}:${Date.now()}`;
        const sqlCriador = 'INSERT INTO convidados (reserva_id, nome, qr_code, status) VALUES (?, ?, ?, ?)';
        await connection.execute(sqlCriador, [reservaId, user.name, qrCodeDataCriador, 'CHECK-IN']); // O criador já está "confirmado"

        // 3. Inserir as regras de brinde (se houver)
        if (brindes && brindes.length > 0) {
            // ... (sua lógica de inserir brindes continua a mesma) ...
        }

        await connection.commit();
        res.status(201).json({ 
            message: 'Reserva criada com sucesso!', 
            reservaId: reservaId,
            codigoConvite: codigoConvite // Retornamos o código para o app poder montar o link
        });

    } catch (error) {
        await connection.rollback();
        console.error('Erro ao criar reserva (nova lógica de convite):', error);
        res.status(500).json({ message: 'Erro ao criar a reserva.' });
    } finally {
        if (connection) connection.release();
    }
});

    // ==========================================================================================
    // ROTA ANTIGA (POST /place-reservation) - MANTER OU REMOVER?
    // Esta rota se torna obsoleta, pois a rota POST / acima já lida com reservas sem eventoId.
    // Mantida aqui comentada para referência. O ideal é adaptar seu App para usar apenas a POST /
    // ==========================================================================================
    /*
    router.post('/place-reservation', async (req, res) => {
        // LÓGICA ANTIGA AQUI...
        // Para adaptar: colete os dados e chame a mesma lógica da rota POST / acima,
        // passando `tipoReserva: 'NORMAL'` e `eventoId: null`.
        res.status(400).json({ message: "Esta rota está obsoleta. Use a rota principal POST /api/reservas."})
    });
    */


    // ==========================================================================================
    // ROTAS DE LEITURA (GET) - ADAPTADAS PARA O NOVO BANCO DE DADOS
    // ==========================================================================================
    router.get('/', async (req, res) => {
        try {
            const [reservas] = await pool.query('SELECT * FROM reservas ORDER BY data_reserva DESC');
            res.status(200).json(reservas);
        } catch (error) {
            console.error("Erro ao buscar reservas:", error);
            res.status(500).json({ error: "Erro ao buscar reservas" });
        }
    });

    router.get('/:id', async (req, res) => {
        const { id } = req.params;
        try {
            const [reservaPromise, convidadosPromise, brindesPromise] = await Promise.all([
                pool.query('SELECT * FROM reservas WHERE id = ?', [id]),
                pool.query('SELECT id, nome, status, data_checkin, qr_code FROM convidados WHERE reserva_id = ?', [id]),
                pool.query('SELECT * FROM brindes_regras WHERE reserva_id = ?', [id])
            ]);

            const [reservaRows] = reservaPromise;
            if (!reservaRows.length) return res.status(404).json({ error: "Reserva não encontrada" });

            const [convidados] = convidadosPromise;
            const [brindes] = brindesPromise;

            const resultadoCompleto = { ...reservaRows[0], convidados, brindes };
            res.status(200).json(resultadoCompleto);

        } catch (error) {
            console.error("Erro ao buscar detalhes da reserva:", error);
            res.status(500).json({ error: "Erro ao buscar detalhes da reserva" });
        }
    });
    

    // ==========================================================================================
    // ROTAS DE ATUALIZAÇÃO (PUT) - ADAPTADAS
    // ==========================================================================================
    router.put('/:id', async (req, res) => {
        const { id } = req.params;
        // ATENÇÃO: Os campos aqui precisam corresponder aos campos da NOVA tabela `reservas`
        const { nome_lista, data_reserva, status } = req.body; 

        // Adicione aqui outros campos que você queira que sejam atualizáveis na tabela principal de reservas
        // Ex: Se você adicionar um campo 'mesas' na nova tabela 'reservas', ele entraria aqui.
        try {
            await pool.query(
                `UPDATE reservas SET nome_lista = ?, data_reserva = ?, status = ? WHERE id = ?`,
                [nome_lista, data_reserva, status, id]
            );
            res.status(200).json({ message: "Reserva atualizada com sucesso" });
        } catch (error) {
            console.error("Erro ao atualizar reserva:", error);
            res.status(500).json({ error: "Erro ao atualizar reserva" });
        }
    });

    // ROTA ANTIGA de atualização de status - REFATORADA
    // A lógica de gerar QR Code foi removida daqui, pois agora ele é criado junto com o convidado.
    // Esta rota agora serve apenas para, por exemplo, um admin aprovar uma lista.
    router.put('/update-status/:id', async (req, res) => {
        const { id } = req.params;
        const { status } = req.body; // Ex: 'ATIVA', 'CONCLUIDA', 'CANCELADA'

        if (!status) {
            return res.status(400).json({ message: 'O campo status é obrigatório.' });
        }
    
        try {
            const [result] = await pool.query('UPDATE reservas SET status = ? WHERE id = ?', [status, id]);
            
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Reserva não encontrada.' });
            }

            res.status(200).json({ message: 'Status da reserva atualizado com sucesso!' });
    
        } catch (error) {
            console.error(`Erro geral ao atualizar o status da reserva ID: ${id}`, error);
            res.status(500).json({ message: 'Erro ao atualizar o status da reserva.' });
        }
    });

    return router;
};
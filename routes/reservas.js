// routes/reservas.js

const express = require('express');
const auth = require('../middleware/auth'); 
// A função qrcode não é usada diretamente neste arquivo, pode ser removida se não for usada para geração de QR aqui
// const qrcode = require('qrcode');

module.exports = (pool) => {
    const router = express.Router();

    // ==========================================================================================
    // FUNÇÃO AUXILIAR: Verifica e Ativa Brindes
    // Esta função será exportada e chamada após um check-in de convidado em outras rotas.
    // ==========================================================================================
    const checkAndAwardBrindes = async (reservaId) => {
        const connection = await pool.getConnection();
        try {
            // 1. Contar convidados com CHECK-IN ou CONFIRMADO_LOCAL
            const [confirmedGuestsRows] = await connection.query(
                `SELECT COUNT(id) AS count FROM convidados WHERE reserva_id = ? AND (status = 'CHECK-IN' OR geo_checkin_status = 'CONFIRMADO_LOCAL')`,
                [reservaId]
            );
            const confirmedCount = confirmedGuestsRows[0].count;

            // 2. Obter quantidade total de convidados da reserva e brindes associados
            const [reservationData] = await connection.query(
                `SELECT r.quantidade_convidados, br.id AS brinde_id, br.descricao, br.condicao_tipo, br.condicao_valor, br.status AS brinde_status 
                 FROM reservas r
                 LEFT JOIN brindes_regras br ON r.id = br.reserva_id
                 WHERE r.id = ?`,
                [reservaId]
            );

            if (!reservationData.length || !reservationData[0].brinde_id) {
                // console.log(`Reserva ${reservaId} não encontrada ou sem regras de brinde associadas.`);
                return; // Nenhuma regra de brinde para esta reserva ou reserva não encontrada
            }

            const reservation = reservationData[0];
            const totalGuestsExpected = reservation.quantidade_convidados;
            const brinde = reservation; // Os dados do brinde estão no mesmo objeto da reserva neste JOIN

            const condicaoValorNumerico = parseInt(brinde.condicao_valor, 10); 
            if (isNaN(condicaoValorNumerico)) {
                console.error(`Valor da condição do brinde inválido para a reserva ${reservaId}: ${brinde.condicao_valor}`);
                return;
            }

            let shouldAwardBrinde = false;

            // Lógica para MINIMO_CHECKINS
            if (brinde.condicao_tipo === 'MINIMO_CHECKINS') {
                if (confirmedCount >= condicaoValorNumerico) {
                    shouldAwardBrinde = true;
                }
            } 
            // Exemplo para PORCENTAGEM (adapte sua tabela brindes_regras para ter 'PORCENTAGEM')
            // else if (brinde.condicao_tipo === 'PORCENTAGEM') {
            //     const percentageConfirmed = (confirmedCount / totalGuestsExpected) * 100;
            //     if (percentageConfirmed >= condicaoValorNumerico) {
            //         shouldAwardBrinde = true;
            //     }
            // }

            // 3. Atualizar status do brinde se a condição for atendida e o status atual não for LIBERADO/ENTREGUE
            if (shouldAwardBrinde && brinde.brinde_status !== 'LIBERADO' && brinde.brinde_status !== 'ENTREGUE') {
                await connection.query(
                    `UPDATE brindes_regras SET status = 'LIBERADO' WHERE id = ?`,
                    [brinde.brinde_id]
                );
                console.log(`Brinde ID ${brinde.brinde_id} da Reserva ${reservaId} LIBERADO!`);
            }

        } catch (error) {
            console.error('Erro em checkAndAwardBrindes:', error);
        } finally {
            if (connection) connection.release();
        }
    }; // Fim da função checkAndAwardBrindes

    // ==========================================================================================
    // ROTAS DE CRIAÇÃO (POST /)
    // ==========================================================================================
    router.post('/', async (req, res) => {
        const { 
            userId, tipoReserva, nomeLista, dataReserva, eventoId, quantidadeConvidados, brindes 
        } = req.body;
        const { customAlphabet } = await import('nanoid');  
        const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);
        const codigoConvite = nanoid();

        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            const sqlReserva = 'INSERT INTO reservas (user_id, tipo_reserva, nome_lista, data_reserva, evento_id, quantidade_convidados, codigo_convite) VALUES (?, ?, ?, ?, ?, ?, ?)';
            const [reservaResult] = await connection.execute(sqlReserva, [
                userId, tipoReserva, nomeLista, dataReserva, eventoId, quantidadeConvidados, codigoConvite
            ]);
            const reservaId = reservaResult.insertId;

            const [[user]] = await connection.query('SELECT name FROM users WHERE id = ?', [userId]);
            if (!user) throw new Error('Usuário criador não encontrado.');
            
            const qrcode = require('qrcode'); // Importar qrcode aqui para uso pontual
            const qrCodeDataCriador = `reserva:${reservaId}:convidado:${user.name.replace(/\s/g, '')}:${Date.now()}`;
            const sqlCriador = 'INSERT INTO convidados (reserva_id, nome, qr_code, status, geo_checkin_status) VALUES (?, ?, ?, ?, ?)'; // Adicionado geo_checkin_status
            await connection.execute(sqlCriador, [reservaId, user.name, qrCodeDataCriador, 'CHECK-IN', 'NAO_APLICAVEL']); // Criador já check-in, local não aplicável

            // Inserir as regras de brinde (se houver)
            if (brindes && brindes.length > 0) {
                const brindeSql = 'INSERT INTO brindes_regras (reserva_id, descricao, condicao_tipo, condicao_valor, status) VALUES (?, ?, ?, ?, ?)';
                for (const brinde of brindes) {
                    await connection.execute(brindeSql, [
                        reservaId,
                        brinde.descricao,
                        brinde.condicao_tipo,
                        brinde.condicao_valor,
                        brinde.status || 'PENDENTE' // Assume PENDENTE se não especificado
                    ]);
                }
            }

            await connection.commit();
            res.status(201).json({ 
                message: 'Reserva criada com sucesso!', 
                reservaId: reservaId,
                codigoConvite: codigoConvite
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
    // ROTAS DE LEITURA (GET)
    // ==========================================================================================
    // ROTA PARA BUSCAR TODAS AS RESERVAS (GET /)
    router.get('/', auth, async (req, res) => {
        const userId = req.user.id;
        const userRole = req.user.role;

        try {
            let query;
            let queryParams = [];

            if (userRole === 'admin') {
                query = `
                    SELECT
                        r.id, r.tipo_reserva AS brinde, r.quantidade_convidados, r.mesas, r.status, r.data_reserva,
                        r.codigo_convite,
                        u.name AS creatorName,
                        u.email, u.telefone, u.foto_perfil,
                        e.nome_do_evento, e.data_do_evento, e.hora_do_evento, e.imagem_do_evento,
                        p.name AS casa_do_evento,
                        p.street AS local_do_evento,
                        (SELECT COUNT(c.id) FROM convidados c WHERE c.reserva_id = r.id AND (c.status = 'CHECK-IN' OR c.geo_checkin_status = 'CONFIRMADO_LOCAL')) AS confirmedGuestsCount,
                        (SELECT br.status FROM brindes_regras br WHERE br.reserva_id = r.id LIMIT 1) AS brindeStatus
                    FROM reservas r
                    JOIN users u ON r.user_id = u.id
                    LEFT JOIN eventos e ON r.evento_id = e.id
                    LEFT JOIN places p ON e.id_place = p.id
                    ORDER BY r.data_reserva DESC
                `;
            } else {
                query = `
                    SELECT
                        r.id, r.tipo_reserva AS brinde, r.quantidade_convidados, r.mesas, r.status, r.data_reserva,
                        r.codigo_convite,
                        u.name AS creatorName,
                        u.email, u.telefone, u.foto_perfil,
                        e.nome_do_evento, e.data_do_evento, e.hora_do_evento, e.imagem_do_evento,
                        p.name AS casa_do_evento,
                        p.street AS local_do_evento,
                        (SELECT COUNT(c.id) FROM convidados c WHERE c.reserva_id = r.id AND (c.status = 'CHECK-IN' OR c.geo_checkin_status = 'CONFIRMADO_LOCAL')) AS confirmedGuestsCount,
                        (SELECT br.status FROM brindes_regras br WHERE br.reserva_id = r.id LIMIT 1) AS brindeStatus
                    FROM reservas r
                    JOIN users u ON r.user_id = u.id
                    LEFT JOIN eventos e ON r.evento_id = e.id
                    LEFT JOIN places p ON e.id_place = p.id
                    WHERE r.user_id = ?
                    ORDER BY r.data_reserva DESC
                `;
                queryParams.push(userId);
            }
            
            const [reservas] = await pool.query(query, queryParams);
            res.status(200).json(reservas);
        } catch (error) {
            console.error("Erro ao buscar reservas:", error);
            res.status(500).json({ error: "Erro ao buscar reservas" });
        }
    });

    // ROTA PARA BUSCAR DETALHES DE UMA ÚNICA RESERVA POR ID (GET /:id)
    router.get('/:id', async (req, res) => {
        const { id } = req.params;
        try {
            const [reservaRows] = await pool.query(`
                SELECT
                    r.id, r.user_id, r.evento_id,
                    r.tipo_reserva AS brinde,
                    r.quantidade_convidados,
                    r.mesas,
                    r.status,
                    r.data_reserva,
                    r.codigo_convite,
                    r.nome_lista,
                    u.name AS creatorName,
                    u.email AS userEmail,
                    u.telefone AS userTelefone,
                    u.foto_perfil AS userFotoPerfil,
                    e.nome_do_evento,
                    e.data_do_evento,
                    e.hora_do_evento,
                    e.imagem_do_evento,
                    p.name AS casa_do_evento,
                    p.street AS local_do_evento,
                    (SELECT COUNT(c.id) FROM convidados c WHERE c.reserva_id = r.id AND (c.status = 'CHECK-IN' OR c.geo_checkin_status = 'CONFIRMADO_LOCAL')) AS confirmedGuestsCount,
                    (SELECT br.status FROM brindes_regras br WHERE br.reserva_id = r.id LIMIT 1) AS brindeStatus -- Adicionado status do brinde para detalhes
                FROM reservas r
                JOIN users u ON r.user_id = u.id
                LEFT JOIN eventos e ON r.evento_id = e.id
                LEFT JOIN JOIN places p ON e.id_place = p.id
                WHERE r.id = ?
            `, [id]);

            if (!reservaRows.length) return res.status(404).json({ error: "Reserva não encontrada" });

            const reserva = reservaRows[0];

            const [convidados] = await pool.query('SELECT id, nome, status, data_checkin, qr_code, geo_checkin_status FROM convidados WHERE reserva_id = ?', [id]);
            const [brindes] = await pool.query('SELECT id, descricao, condicao_tipo, condicao_valor, status FROM brindes_regras WHERE reserva_id = ?', [id]);

            const resultadoCompleto = {
                ...reserva,
                convidados: convidados,
                brindes: brindes
            };
            res.status(200).json(resultadoCompleto);

        } catch (error) {
            console.error("Erro ao buscar detalhes da reserva:", error);
            res.status(500).json({ error: "Erro ao buscar detalhes da reserva" });
        }
    });
    
    // ==========================================================================================
    // ROTAS DE ATUALIZAÇÃO (PUT)
    // ==========================================================================================
    router.put('/:id', async (req, res) => {
        const { id } = req.params;
        const { nome_lista, data_reserva, status } = req.body; 

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

    router.put('/update-status/:id', async (req, res) => {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ message: 'O campo status é obrigatório.' });
        }
    
        try {
            const [result] = await pool.query('UPDATE reservas SET status = ? WHERE id = ?', [status, id]);
            
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Reserva não encontrada.' });
            }

            // A chamada para checkAndAwardBrindes foi movida para a rota de check-in de convidado
            // ou outra lógica que atualiza o status do convidado, pois essa rota não tem info suficiente.
            // Para garantir que ainda funciona, você PODE CHAMAR AQUI, mas o melhor gatilho é o check-in do convidado.
            // await checkAndAwardBrindes(id); // <--- Opcional, se você quiser que atualizar status da RESERVA acione brindes

            res.status(200).json({ message: 'Status da reserva atualizado com sucesso!' });
    
        } catch (error) {
            console.error(`Erro geral ao atualizar o status da reserva ID: ${id}`, error);
            res.status(500).json({ message: 'Erro ao atualizar o status da reserva.' });
        }
    });

    // ROTA PARA RESGATAR BRINDE (PUT /api/reservas/brindes/:brindeId/resgatar)
    router.put('/brindes/:brindeId/resgatar', auth, async (req, res) => {
        const { brindeId } = req.params;
        try {
            const [result] = await pool.query(
                `UPDATE brindes_regras SET status = 'ENTREGUE' WHERE id = ? AND status = 'LIBERADO'`,
                [brindeId]
            );
            if (result.affectedRows === 0) {
                return res.status(400).json({ message: 'Brinde não encontrado ou não está no status "LIBERADO" para resgate.' });
            }
            res.status(200).json({ message: 'Brinde resgatado com sucesso!' });
        } catch (error) {
            console.error("Erro ao resgatar brinde:", error);
            res.status(500).json({ message: 'Erro ao resgatar brinde.' });
        }
    });

    return {
        router: router,
        checkAndAwardBrindes: checkAndAwardBrindes // Exporta a função
    };
};
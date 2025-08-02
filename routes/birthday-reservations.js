// routes/birthday-reservations.js

const express = require('express');
const auth = require('../middleware/auth');

module.exports = (pool) => {
    const router = express.Router();

    // ==========================================================================================
    // ROTA PARA CRIAR RESERVA DE ANIVERSÁRIO (POST /)
    // ==========================================================================================
    router.post('/', auth, async (req, res) => {
        const {
            user_id,
            aniversariante_nome,
            documento,
            whatsapp,
            email,
            data_aniversario,
            quantidade_convidados,
            bar_selecionado,
            decoracao_tipo,
            painel_personalizado,
            painel_tema,
            painel_frase,
            painel_estoque_imagem_url,
            bebidas,
            comidas,
            presentes,
            tipo_reserva,
            status
        } = req.body;

        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // Inserir na tabela birthday_reservations
            const sqlBirthdayReservation = `
                INSERT INTO birthday_reservations (
                    user_id, aniversariante_nome, documento, whatsapp, email, bar_selecionado,
                    data_aniversario, quantidade_convidados, id_casa_evento, decoracao_tipo, 
                    painel_personalizado, painel_tema, painel_frase, painel_estoque_imagem_url,
                    bebidas_json, comidas_json, presentes_json, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            // Mapear bar selecionado para ID da casa de evento
            let idCasaEvento = null;
            if (bar_selecionado) {
                const [placeResult] = await connection.query(
                    'SELECT id FROM places WHERE name = ?',
                    [bar_selecionado]
                );
                if (placeResult.length > 0) {
                    idCasaEvento = placeResult[0].id;
                }
            }

            const [birthdayResult] = await connection.execute(sqlBirthdayReservation, [
                user_id,
                aniversariante_nome,
                documento || null,
                whatsapp || null,
                email || null,
                bar_selecionado || null,
                data_aniversario,
                quantidade_convidados,
                idCasaEvento,
                decoracao_tipo,
                painel_personalizado ? 1 : 0,
                painel_tema || null,
                painel_frase || null,
                painel_estoque_imagem_url || null,
                JSON.stringify(bebidas || {}),
                JSON.stringify(comidas || {}),
                JSON.stringify(presentes || []),
                status || 'pendente'
            ]);

            const birthdayReservationId = birthdayResult.insertId;

            // Nota: Bebidas, comidas e presentes agora são armazenados como JSON
            // nos campos bebidas_json, comidas_json e presentes_json respectivamente

            // Criar também uma entrada na tabela reservas para compatibilidade
            const { customAlphabet } = await import('nanoid');
            const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);
            const codigoConvite = nanoid();

            const sqlReserva = `
                INSERT INTO reservas (
                    user_id, tipo_reserva, nome_lista, data_reserva, 
                    quantidade_convidados, codigo_convite, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `;

            const [reservaResult] = await connection.execute(sqlReserva, [
                user_id,
                'aniversario',
                `Aniversário de ${aniversariante_nome}`,
                data_aniversario,
                quantidade_convidados,
                codigoConvite,
                status || 'pendente'
            ]);

            const reservaId = reservaResult.insertId;

            // Inserir o criador como primeiro convidado
            const [[user]] = await connection.query('SELECT name FROM users WHERE id = ?', [user_id]);
            if (user) {
                const qrcode = require('qrcode');
                const qrCodeDataCriador = `reserva:${reservaId}:convidado:${user.name.replace(/\s/g, '')}:${Date.now()}`;
                
                const sqlCriador = 'INSERT INTO convidados (reserva_id, nome, qr_code, status, geo_checkin_status) VALUES (?, ?, ?, ?, ?)';
                await connection.execute(sqlCriador, [reservaId, user.name, qrCodeDataCriador, 'PENDENTE', 'NAO_APLICAVEL']);
            }

            await connection.commit();

            res.status(201).json({
                message: 'Reserva de aniversário criada com sucesso!',
                reservaId: reservaId,
                birthdayReservationId: birthdayReservationId,
                codigoConvite: codigoConvite,
                dados: {
                    aniversariante: aniversariante_nome,
                    data: data_aniversario,
                    bar: bar_selecionado,
                    convidados: quantidade_convidados,
                    decoracao: decoracao_tipo,
                    bebidas: bebidas,
                    comidas: comidas,
                    presentes: presentes
                }
            });

        } catch (error) {
            await connection.rollback();
            console.error('Erro ao criar reserva de aniversário:', error);
            res.status(500).json({ 
                message: 'Erro ao criar a reserva de aniversário.',
                error: error.message 
            });
        } finally {
            if (connection) connection.release();
        }
    });

    // ==========================================================================================
    // ROTA PARA BUSCAR RESERVAS DE ANIVERSÁRIO DO USUÁRIO (GET /)
    // ==========================================================================================
    router.get('/', auth, async (req, res) => {
        const userId = req.user.id;

        try {
            const query = `
                SELECT 
                    br.id, br.aniversariante_nome, br.data_aniversario, br.quantidade_convidados,
                    br.decoracao_tipo, br.painel_personalizado, br.painel_tema, br.painel_frase,
                    br.status, br.created_at, br.updated_at,
                    p.name AS bar_nome
                FROM birthday_reservations br
                LEFT JOIN places p ON br.id_casa_evento = p.id
                WHERE br.user_id = ?
                ORDER BY br.created_at DESC
            `;

            const [rows] = await pool.query(query, [userId]);

            res.status(200).json({
                message: 'Reservas de aniversário carregadas com sucesso',
                reservas: rows
            });

        } catch (error) {
            console.error('Erro ao buscar reservas de aniversário:', error);
            res.status(500).json({ 
                message: 'Erro ao carregar reservas de aniversário.',
                error: error.message 
            });
        }
    });

    // ==========================================================================================
    // ROTA PARA BUSCAR DETALHES DE UMA RESERVA DE ANIVERSÁRIO (GET /:id)
    // ==========================================================================================
    router.get('/:id', auth, async (req, res) => {
        const { id } = req.params;
        const userId = req.user.id;

        try {
            const query = `
                SELECT 
                    br.*, p.name AS bar_nome
                FROM birthday_reservations br
                LEFT JOIN places p ON br.id_casa_evento = p.id
                WHERE br.id = ? AND br.user_id = ?
            `;

            const [rows] = await pool.query(query, [id, userId]);

            if (rows.length === 0) {
                return res.status(404).json({ 
                    message: 'Reserva de aniversário não encontrada' 
                });
            }

            res.status(200).json({
                message: 'Detalhes da reserva carregados com sucesso',
                reserva: rows[0]
            });

        } catch (error) {
            console.error('Erro ao buscar detalhes da reserva:', error);
            res.status(500).json({ 
                message: 'Erro ao carregar detalhes da reserva.',
                error: error.message 
            });
        }
    });

    return router;
}; 
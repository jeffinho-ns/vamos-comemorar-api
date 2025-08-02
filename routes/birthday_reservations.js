// routes/birthday_reservations.js
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

// ROTA PÚBLICA PARA BUSCAR RESERVAS DE ANIVERSÁRIO
router.get('/public', async (req, res) => {
    try {
        const query = `
            SELECT
                br.id,
                br.aniversariante_nome,
                br.data_aniversario,
                br.quantidade_convidados,
                br.decoracao_tipo,
                br.painel_personalizado,
                br.painel_tema,
                br.painel_frase,
                br.painel_estoque_imagem_url,
                br.bebida_balde_budweiser,
                br.bebida_balde_corona,
                br.bebida_balde_heineken,
                br.bebida_combo_gin_142,
                br.bebida_licor_rufus,
                br.status,
                br.created_at,
                u.name AS creatorName,
                p.name AS casa_do_evento,
                p.id AS id_place,
                (SELECT COUNT(c.id) FROM convidados c WHERE c.reserva_id = br.id AND (c.status = 'CHECK-IN' OR c.geo_checkin_status = 'CONFIRMADO_LOCAL')) AS confirmedGuestsCount
            FROM birthday_reservations br
            JOIN users u ON br.user_id = u.id
            LEFT JOIN places p ON br.id_casa_evento = p.id
            ORDER BY br.data_aniversario DESC
        `;
        
        const [reservas] = await pool.query(query);
        console.log(`Debug - Encontradas ${reservas.length} reservas de aniversário`);
        res.status(200).json(reservas);
    } catch (error) {
        console.error("Erro ao buscar reservas de aniversário:", error);
        res.status(500).json({ error: "Erro ao buscar reservas de aniversário", details: error.message });
    }
});

// ROTA PARA CRIAR NOVA RESERVA DE ANIVERSÁRIO
router.post('/', auth, async (req, res) => {
    const userId = req.user.id;
    const {
        aniversariante_nome,
        data_aniversario,
        quantidade_convidados,
        id_casa_evento,
        decoracao_tipo,
        painel_personalizado,
        painel_tema,
        painel_frase,
        painel_estoque_imagem_url,
        bebidas,
        comidas,
        presentes
    } = req.body;

    try {
        // Inserir reserva de aniversário
        const [result] = await pool.query(`
            INSERT INTO birthday_reservations (
                user_id, aniversariante_nome, data_aniversario, quantidade_convidados,
                id_casa_evento, decoracao_tipo, painel_personalizado, painel_tema,
                painel_frase, painel_estoque_imagem_url, bebida_balde_budweiser,
                bebida_balde_corona, bebida_balde_heineken, bebida_combo_gin_142,
                bebida_licor_rufus, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente')
        `, [
            userId, aniversariante_nome, data_aniversario, quantidade_convidados,
            id_casa_evento, decoracao_tipo, painel_personalizado ? 1 : 0, painel_tema,
            painel_frase, painel_estoque_imagem_url,
            bebidas?.balde_budweiser || 0,
            bebidas?.balde_corona || 0,
            bebidas?.balde_heineken || 0,
            bebidas?.combo_gin_142 || 0,
            bebidas?.licor_rufus || 0
        ]);

        const reservaId = result.insertId;

        // Inserir convidados se fornecidos
        if (req.body.nomes_convidados && Array.isArray(req.body.nomes_convidados)) {
            for (const nome of req.body.nomes_convidados) {
                await pool.query(`
                    INSERT INTO convidados (reserva_id, nome, status, inserted_by)
                    VALUES (?, ?, 'PENDENTE', ?)
                `, [reservaId, nome, userId]);
            }
        }

        res.status(201).json({
            message: 'Reserva de aniversário criada com sucesso',
            reserva_id: reservaId
        });

    } catch (error) {
        console.error("Erro ao criar reserva de aniversário:", error);
        res.status(500).json({ error: "Erro ao criar reserva de aniversário", details: error.message });
    }
});

// ROTA PARA BUSCAR RESERVAS DE ANIVERSÁRIO DO USUÁRIO
router.get('/', auth, async (req, res) => {
    const userId = req.user.id;
    const userRole = req.user.role;

    try {
        let query;
        let queryParams = [];

        if (userRole === 'admin') {
            query = `
                SELECT
                    br.id, br.aniversariante_nome, br.data_aniversario,
                    br.quantidade_convidados, br.decoracao_tipo, br.status,
                    br.created_at, u.name AS creatorName, p.name AS casa_do_evento,
                    p.id AS id_place,
                    (SELECT COUNT(c.id) FROM convidados c WHERE c.reserva_id = br.id AND (c.status = 'CHECK-IN' OR c.geo_checkin_status = 'CONFIRMADO_LOCAL')) AS confirmedGuestsCount
                FROM birthday_reservations br
                JOIN users u ON br.user_id = u.id
                LEFT JOIN places p ON br.id_casa_evento = p.id
                ORDER BY br.data_aniversario DESC
            `;
        } else {
            query = `
                SELECT
                    br.id, br.aniversariante_nome, br.data_aniversario,
                    br.quantidade_convidados, br.decoracao_tipo, br.status,
                    br.created_at, u.name AS creatorName, p.name AS casa_do_evento,
                    p.id AS id_place,
                    (SELECT COUNT(c.id) FROM convidados c WHERE c.reserva_id = br.id AND (c.status = 'CHECK-IN' OR c.geo_checkin_status = 'CONFIRMADO_LOCAL')) AS confirmedGuestsCount
                FROM birthday_reservations br
                JOIN users u ON br.user_id = u.id
                LEFT JOIN places p ON br.id_casa_evento = p.id
                WHERE br.user_id = ?
                ORDER BY br.data_aniversario DESC
            `;
            queryParams.push(userId);
        }

        const [reservas] = await pool.query(query, queryParams);
        res.status(200).json(reservas);

    } catch (error) {
        console.error("Erro ao buscar reservas de aniversário:", error);
        res.status(500).json({ error: "Erro ao buscar reservas de aniversário" });
    }
});

// ROTA PARA BUSCAR UMA RESERVA DE ANIVERSÁRIO ESPECÍFICA
router.get('/:id', auth, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    try {
        let query;
        let queryParams = [id];

        if (userRole !== 'admin') {
            query = `
                SELECT * FROM birthday_reservations 
                WHERE id = ? AND user_id = ?
            `;
            queryParams.push(userId);
        } else {
            query = `SELECT * FROM birthday_reservations WHERE id = ?`;
        }

        const [reservas] = await pool.query(query, queryParams);

        if (reservas.length === 0) {
            return res.status(404).json({ error: "Reserva de aniversário não encontrada" });
        }

        res.status(200).json(reservas[0]);

    } catch (error) {
        console.error("Erro ao buscar reserva de aniversário:", error);
        res.status(500).json({ error: "Erro ao buscar reserva de aniversário" });
    }
});

// ROTA PARA ATUALIZAR UMA RESERVA DE ANIVERSÁRIO
router.put('/:id', auth, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    try {
        // Verificar se a reserva existe e pertence ao usuário (se não for admin)
        let checkQuery = `SELECT user_id FROM birthday_reservations WHERE id = ?`;
        let checkParams = [id];

        if (userRole !== 'admin') {
            checkQuery += ` AND user_id = ?`;
            checkParams.push(userId);
        }

        const [reservas] = await pool.query(checkQuery, checkParams);

        if (reservas.length === 0) {
            return res.status(404).json({ error: "Reserva de aniversário não encontrada" });
        }

        // Atualizar a reserva
        const updateFields = [];
        const updateValues = [];

        Object.keys(req.body).forEach(key => {
            if (key !== 'id' && key !== 'user_id' && key !== 'created_at') {
                updateFields.push(`${key} = ?`);
                updateValues.push(req.body[key]);
            }
        });

        if (updateFields.length === 0) {
            return res.status(400).json({ error: "Nenhum campo para atualizar" });
        }

        updateValues.push(id);
        const query = `UPDATE birthday_reservations SET ${updateFields.join(', ')} WHERE id = ?`;

        await pool.query(query, updateValues);

        res.status(200).json({ message: "Reserva de aniversário atualizada com sucesso" });

    } catch (error) {
        console.error("Erro ao atualizar reserva de aniversário:", error);
        res.status(500).json({ error: "Erro ao atualizar reserva de aniversário" });
    }
});

// ROTA PARA EXCLUIR UMA RESERVA DE ANIVERSÁRIO
router.delete('/:id', auth, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    try {
        let query = `DELETE FROM birthday_reservations WHERE id = ?`;
        let queryParams = [id];

        if (userRole !== 'admin') {
            query += ` AND user_id = ?`;
            queryParams.push(userId);
        }

        const [result] = await pool.query(query, queryParams);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Reserva de aniversário não encontrada" });
        }

        res.status(200).json({ message: "Reserva de aniversário excluída com sucesso" });

    } catch (error) {
        console.error("Erro ao excluir reserva de aniversário:", error);
        res.status(500).json({ error: "Erro ao excluir reserva de aniversário" });
    }
});

module.exports = router; 
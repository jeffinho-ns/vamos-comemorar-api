const express = require('express');
const auth = require('../middleware/auth'); // Renomeei para 'auth' para clareza

module.exports = (pool) => {
    const router = express.Router();

    const checkPermission = async (userId, convidadoId) => {
        console.log(`[checkPermission] - A. Iniciando verificação para userId: ${userId}, convidadoId: ${convidadoId}`);
        const sql = `
            SELECT r.user_id
            FROM convidados c
            JOIN reservas r ON c.reserva_id = r.id
            WHERE c.id = ?
        `;
        try {
            console.log(`[checkPermission] - B. Executando query...`);
            const [[result]] = await pool.query(sql, [convidadoId]);
            console.log(`[checkPermission] - C. Query executada. Resultado:`, result);

            if (result) {
                console.log(`[checkPermission] - DEBUG: Comparando DB user_id (${result.user_id}, tipo: ${typeof result.user_id}) com JWT id (${userId}, tipo: ${typeof userId})`);
            }

            if (!result || result.user_id !== userId) {
                console.log(`[checkPermission] - D. Permissão NEGADA.`);
                return false;
            }
            console.log(`[checkPermission] - E. Permissão CONCEDIDA.`);
            return true;
        } catch (error) {
            console.error('[checkPermission] - F. ERRO na query da permissão!', error);
            throw error;
        }
    };

    // =========================================================================
    // ---- NOVA ROTA: GET para listar convidados de um evento ----
    // A rota no front-end está chamando: `/api/convidados/${eventId}`
    // Portanto, a rota no backend deve ser `/:eventId`
    // E ela deve buscar os convidados vinculados às reservas daquele evento.
    router.get('/:eventId', auth, async (req, res) => {
        const { eventId } = req.params;
        const userId = req.user.id; // ID do usuário autenticado via JWT
        const userRole = req.user.role; // Papel do usuário autenticado

        try {
            let convidados;
            // Admins podem ver todos os convidados de qualquer evento
            if (userRole === 'admin') {
                [convidados] = await pool.query(`
                    SELECT c.id, c.nome, c.documento, c.email, c.data_checkin, r.id as reserva_id, r.user_id as reserva_user_id
                    FROM convidados c
                    JOIN reservas r ON c.reserva_id = r.id
                    WHERE r.evento_id = ?
                `, [eventId]);
            } else {
                // Outros usuários (gerente, promoter, etc.) só podem ver convidados
                // de eventos ou reservas que eles próprios criaram ou têm permissão
                // Aqui, vamos assumir que eles só podem ver convidados de eventos que eles próprios são criadores da reserva
                [convidados] = await pool.query(`
                    SELECT c.id, c.nome, c.documento, c.email, c.data_checkin, r.id as reserva_id, r.user_id as reserva_user_id
                    FROM convidados c
                    JOIN reservas r ON c.reserva_id = r.id
                    WHERE r.evento_id = ? AND r.user_id = ? -- Filtra por evento E por usuário da reserva
                `, [eventId, userId]);
            }

            // Se não houver convidados, retorna array vazio ou 404, dependendo da sua preferência.
            // Retornar array vazio é geralmente melhor para listas.
            res.json(convidados);

        } catch (err) {
            console.error('Erro ao buscar convidados do evento:', err);
            // É crucial enviar um status 500 E uma mensagem JSON para o front-end
            res.status(500).json({ message: 'Erro interno ao buscar convidados do evento' });
        }
    });
    // =========================================================================

    router.put('/:id', auth, async (req, res) => {
        const { id } = req.params;
        const { nome, documento } = req.body;
        if (!nome) return res.status(400).json({ message: 'O campo "nome" é obrigatório.' });
        try {
            const hasPermission = await checkPermission(req.user.id, id);
            if (!hasPermission && req.user.role !== 'admin') return res.status(403).json({ message: 'Acesso negado.' });

            const [result] = await pool.query('UPDATE convidados SET nome = ?, documento = ? WHERE id = ?', [nome, documento || null, id]);
            if (result.affectedRows === 0) return res.status(404).json({ message: 'Convidado não encontrado.' });
            res.json({ message: 'Convidado atualizado com sucesso' });
        } catch (err) {
            console.error('Erro ao atualizar convidado:', err);
            res.status(500).json({ message: 'Erro ao atualizar convidado' });
        }
    });

    router.delete('/:id', auth, async (req, res) => {
        const { id } = req.params;
        try {
            const hasPermission = await checkPermission(req.user.id, id);
            if (!hasPermission && req.user.role !== 'admin') return res.status(403).json({ message: 'Acesso negado.' });

            const [result] = await pool.query('DELETE FROM convidados WHERE id = ?', [id]);
            if (result.affectedRows === 0) return res.status(404).json({ message: 'Convidado não encontrado.' });
            res.json({ message: 'Convidado removido com sucesso' });
        } catch (err) {
            console.error('Erro ao remover convidado:', err);
            res.status(500).json({ message: 'Erro ao remover convidado' });
        }
    });

    return router;
};
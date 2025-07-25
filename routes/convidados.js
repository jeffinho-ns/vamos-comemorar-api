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

        // ==============================================================
        // ---- ADICIONE ESTE NOVO CONSOLE.LOG AQUI ----
        if (result) {
            console.log(`[checkPermission] - DEBUG: Comparando DB user_id (${result.user_id}, tipo: ${typeof result.user_id}) com JWT id (${userId}, tipo: ${typeof userId})`);
        }
        // ==============================================================

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

    // ... (Aqui entrarão as outras funcionalidades que desenhamos)

    return router;
};
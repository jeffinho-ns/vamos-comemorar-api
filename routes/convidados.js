const express = require('express');
const auth = require('../middleware/auth'); // Renomeei para 'auth' para clareza

module.exports = (pool) => {
    const router = express.Router();

    // Função auxiliar para calcular distância entre duas coordenadas (Fórmula de Haversine simplificada)
    // Retorna a distância em quilômetros
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371; // Raio da Terra em quilômetros
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        return distance; // Distância em KM
    };

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

            // A permissão aqui deve ser: o user_id do token PRECISA ser o mesmo do user_id da reserva associada ao convidado
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
    // ---- NOVA ROTA: POST para check-in por localização do convidado ----
    router.post('/:id/self-check-in', auth, async (req, res) => {
        const convidadoId = req.params.id;
        const userIdFromToken = req.user.id; // ID do usuário autenticado (deve ser o próprio convidado)
        const { latitude, longitude } = req.body; // Coordenadas enviadas pelo app Flutter

        // Parâmetros de validação de localização (ajuste conforme a necessidade)
        const MAX_DISTANCE_KM = 0.5; // Ex: 500 metros
        const MIN_DISTANCE_KM = 0.001; // Para evitar 0,0 km exatos, pode ser útil

        if (typeof latitude === 'undefined' || typeof longitude === 'undefined') {
            return res.status(400).json({ message: 'Latitude e longitude são obrigatórias.' });
        }

        try {
            // 1. Verificar se o convidado existe e se pertence ao usuário logado
            const convidadoQuery = `
                SELECT
                    c.id, c.nome, c.status, c.geo_checkin_status,
                    r.evento_id, r.user_id AS criador_reserva_id,
                    e.nome_do_evento,
                    p.latitude AS event_latitude, p.longitude AS event_longitude
                FROM convidados c
                JOIN reservas r ON c.reserva_id = r.id
                JOIN eventos e ON r.evento_id = e.id
                JOIN places p ON e.id_place = p.id -- Usando a nova FK id_place
                WHERE c.id = ? AND r.user_id = ? -- O convidado deve estar associado à reserva do usuário logado
            `;
            const [[convidado]] = await pool.query(convidadoQuery, [convidadoId, userIdFromToken]);

            if (!convidado) {
                return res.status(404).json({ message: 'Convidado não encontrado ou não pertence a este usuário.' });
            }

            // 2. Verificar se o convidado já fez check-in na entrada (via QR Code)
            if (convidado.status !== 'CHECK-IN') {
                return res.status(400).json({ message: 'Convidado ainda não fez o check-in na entrada do evento.' });
            }

            // 3. Verificar se o check-in por localização já foi feito
            if (convidado.geo_checkin_status === 'CONFIRMADO_LOCAL') {
                return res.status(400).json({ message: 'Check-in de localização já realizado para este convidado.' });
            }
            
            // 4. Obter a localização do evento (do Place)
            const eventLatitude = parseFloat(convidado.event_latitude);
            const eventLongitude = parseFloat(convidado.event_longitude);

            if (isNaN(eventLatitude) || isNaN(eventLongitude)) {
                console.warn(`Localização do evento ${convidado.nome_do_evento} (${convidado.evento_id}) é inválida: Lat ${convidado.event_latitude}, Lon ${convidado.event_longitude}`);
                return res.status(500).json({ message: 'Localização do evento não configurada ou inválida.' });
            }

            // 5. Calcular a distância
            const distance = calculateDistance(latitude, longitude, eventLatitude, eventLongitude);
            console.log(`Distância calculada para convidado ${convidado.nome}: ${distance.toFixed(3)} km do evento ${convidado.nome_do_evento}.`);

            // 6. Validar a distância
            if (distance > MAX_DISTANCE_KM) {
                await pool.query(
                    `UPDATE convidados SET geo_checkin_status = 'INVALIDO', geo_checkin_timestamp = NOW(), latitude_checkin = ?, longitude_checkin = ? WHERE id = ?`,
                    [latitude, longitude, convidadoId]
                );
                return res.status(400).json({
                    message: `Você está muito longe do local do evento (${distance.toFixed(2)} km). Distância máxima permitida: ${MAX_DISTANCE_KM} km.`,
                    distance: distance
                });
            }
            
            // 7. Atualizar o status do convidado para 'CONFIRMADO_LOCAL'
            await pool.query(
                `UPDATE convidados SET geo_checkin_status = 'CONFIRMADO_LOCAL', geo_checkin_timestamp = NOW(), latitude_checkin = ?, longitude_checkin = ? WHERE id = ?`,
                [latitude, longitude, convidadoId]
            );

            res.status(200).json({ message: 'Check-in de localização confirmado com sucesso!', distance: distance });

        } catch (err) {
            console.error('Erro ao realizar self check-in do convidado:', err);
            res.status(500).json({ message: 'Erro interno ao realizar check-in de localização.', error: err.message });
        }
    });

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
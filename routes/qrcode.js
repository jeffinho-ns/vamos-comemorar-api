const express = require("express");
const router = express.Router();
const pool = require("../config/database");

// Rota para validar QR Code
router.post("/validar", async (req, res) => {
    const { qrCode } = req.body;

    if (!qrCode) {
        return res.status(400).json({ success: false, message: "QR Code não fornecido." });
    }

    try {
        // Consulta no banco para encontrar a reserva com esse QR Code
        const [rows] = await pool.query(
            "SELECT id, nome_do_evento, data_do_evento, status FROM reservas WHERE qrcode = ?",
            [qrCode]
        );

        // Se não encontrou a reserva
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "QR Code inválido ou não encontrado." });
        }

        const reserva = rows[0];

        // Se a reserva não estiver aprovada
        if (reserva.status !== "Aprovado") {
            return res.status(403).json({ success: false, message: "Reserva não aprovada." });
        }

        // Retorna sucesso e informações do evento
        return res.json({
            success: true,
            message: "Reserva confirmada! O cliente pode ser levado até a mesa.",
            id: reserva.id,
            nome_do_evento: reserva.nome_do_evento,
            data_do_evento: reserva.data_do_evento,
        });
    } catch (error) {
        console.error("Erro ao validar QR Code:", error);
        return res.status(500).json({ success: false, message: "Erro interno do servidor." });
    }
});

module.exports = router;

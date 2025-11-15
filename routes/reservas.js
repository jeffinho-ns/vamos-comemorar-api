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
        const client = await pool.connect();
        try {
            // 1. Contar convidados com CHECK-IN ou CONFIRMADO_LOCAL
            const confirmedGuestsResult = await client.query(
                `SELECT COUNT(id) AS count FROM convidados WHERE reserva_id = $1 AND (status = 'CHECK-IN' OR geo_checkin_status = 'CONFIRMADO_LOCAL')`,
                [reservaId]
            );
            const confirmedCount = parseInt(confirmedGuestsResult.rows[0].count);

            // 2. Obter quantidade total de convidados da reserva e brindes associados
            const reservationResult = await client.query(
                `SELECT r.quantidade_convidados, br.id AS brinde_id, br.descricao, br.condicao_tipo, br.condicao_valor, br.status AS brinde_status 
                 FROM reservas r
                 LEFT JOIN brindes_regras br ON r.id = br.reserva_id
                 WHERE r.id = $1`,
                [reservaId]
            );

            if (!reservationResult.rows.length || !reservationResult.rows[0].brinde_id) {
                // console.log(`Reserva ${reservaId} não encontrada ou sem regras de brinde associadas.`);
                return; // Nenhuma regra de brinde para esta reserva ou reserva não encontrada
            }

            const reservation = reservationResult.rows[0];
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
                await client.query(
                    `UPDATE brindes_regras SET status = 'LIBERADO' WHERE id = $1`,
                    [brinde.brinde_id]
                );
                console.log(`Brinde ID ${brinde.brinde_id} da Reserva ${reservaId} LIBERADO!`);
            }

        } catch (error) {
            console.error('Erro em checkAndAwardBrindes:', error);
        } finally {
            if (client) client.release();
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

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            const sqlReserva = 'INSERT INTO reservas (user_id, tipo_reserva, nome_lista, data_reserva, evento_id, quantidade_convidados, codigo_convite) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id';
            const reservaResult = await client.query(sqlReserva, [
                userId, tipoReserva, nomeLista, dataReserva, eventoId, quantidadeConvidados, codigoConvite
            ]);
            const reservaId = reservaResult.rows[0].id;

            const userResult = await client.query('SELECT name FROM users WHERE id = $1', [userId]);
            if (!userResult.rows.length) throw new Error('Usuário criador não encontrado.');
            const user = userResult.rows[0];
            
            const qrcode = require('qrcode');
            const qrCodeDataCriador = `reserva:${reservaId}:convidado:${user.name.replace(/\s/g, '')}:${Date.now()}`;
            
            // ALTERAÇÃO AQUI: Mudar status para 'PENDENTE' ao invés de 'CHECK-IN'
            const sqlCriador = 'INSERT INTO convidados (reserva_id, nome, qr_code, status, geo_checkin_status) VALUES ($1, $2, $3, $4, $5)';
            await client.query(sqlCriador, [reservaId, user.name, qrCodeDataCriador, 'PENDENTE', 'NAO_APLICAVEL']);

            // Inserir as regras de brinde (se houver)
            if (brindes && brindes.length > 0) {
                const brindeSql = 'INSERT INTO brindes_regras (reserva_id, descricao, condicao_tipo, condicao_valor, status) VALUES ($1, $2, $3, $4, $5)';
                for (const brinde of brindes) {
                    await client.query(brindeSql, [
                        reservaId,
                        brinde.descricao,
                        brinde.condicao_tipo,
                        brinde.condicao_valor,
                        brinde.status || 'PENDENTE'
                    ]);
                }
            }

            await client.query('COMMIT');
            res.status(201).json({ 
                message: 'Reserva criada com sucesso!', 
                reservaId: reservaId,
                codigoConvite: codigoConvite
            });

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Erro ao criar reserva (nova lógica de convite):', error);
            res.status(500).json({ message: 'Erro ao criar a reserva.' });
        } finally {
            if (client) client.release();
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
                    WHERE r.user_id = $1
                    ORDER BY r.data_reserva DESC
                `;
                queryParams.push(userId);
            }
            
            const result = await pool.query(query, queryParams);
            res.status(200).json(result.rows);
        } catch (error) {
            console.error("Erro ao buscar reservas:", error);
            res.status(500).json({ error: "Erro ao buscar reservas" });
        }
    });

    // ROTA PARA BUSCAR DETALHES DE UMA ÚNICA RESERVA POR ID (GET /:id)
    router.get('/:id', async (req, res) => {
        const { id } = req.params;
        try {
            const reservaRows = await pool.query(`
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
                LEFT JOIN places p ON e.id_place = p.id
                WHERE r.id = $1
            `, [id]);

            if (!reservaRows.rows.length) return res.status(404).json({ error: "Reserva não encontrada" });

            const reserva = reservaRows.rows[0];

            const convidadosResult = await pool.query('SELECT id, nome, status, data_checkin, qr_code, geo_checkin_status FROM convidados WHERE reserva_id = $1', [id]);
            const brindesResult = await pool.query('SELECT id, descricao, condicao_tipo, condicao_valor, status FROM brindes_regras WHERE reserva_id = $1', [id]);

            const resultadoCompleto = {
                ...reserva,
                convidados: convidadosResult.rows,
                brindes: brindesResult.rows
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
                `UPDATE reservas SET nome_lista = $1, data_reserva = $2, status = $3 WHERE id = $4`,
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
            const result = await pool.query('UPDATE reservas SET status = $1 WHERE id = $2', [status, id]);
            
            if (result.rowCount === 0) {
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
            const result = await pool.query(
                `UPDATE brindes_regras SET status = 'ENTREGUE' WHERE id = $1 AND status = 'LIBERADO'`,
                [brindeId]
            );
            if (result.rowCount === 0) {
                return res.status(400).json({ message: 'Brinde não encontrado ou não está no status "LIBERADO" para resgate.' });
            }
            res.status(200).json({ message: 'Brinde resgatado com sucesso!' });
        } catch (error) {
            console.error("Erro ao resgatar brinde:", error);
            res.status(500).json({ message: 'Erro ao resgatar brinde.' });
        }
    });


    router.get('/camarotes/:id_place', auth, async (req, res) => {
    const { id_place } = req.params;
    try {
        const camarotesResult = await pool.query(`
            SELECT 
                c.id, 
                c.nome_camarote, 
                c.capacidade_maxima, 
                c.status,
                rc.id AS reserva_camarote_id,
                rc.nome_cliente,
                rc.entradas_unisex_free,
                rc.entradas_masculino_free,
                rc.entradas_feminino_free,
                rc.valor_camarote,
                rc.valor_consumacao,
                rc.valor_pago,
                rc.valor_sinal,
                rc.status_reserva,
                rc.data_reserva,
                rc.data_expiracao
            FROM camarotes c
            LEFT JOIN reservas_camarote rc ON c.id = rc.id_camarote AND rc.status_reserva != 'disponivel'
            WHERE c.id_place = $1
            ORDER BY c.nome_camarote
        `, [id_place]);

        res.status(200).json(camarotesResult.rows);
    } catch (error) {
        console.error("Erro ao buscar camarotes:", error);
        res.status(500).json({ error: "Erro ao buscar camarotes" });
    }
});

// ROTA PARA CRIAR UMA NOVA RESERVA DE CAMAROTE
router.post('/camarote', auth, async (req, res) => {
    console.log('🔍 Iniciando criação de reserva de camarote...');
    console.log('📤 Body recebido:', JSON.stringify(req.body, null, 2));
    console.log('👤 User ID:', req.user.id);
    
    const { 
        id_camarote, id_evento, nome_cliente, telefone, cpf_cnpj, email, data_nascimento,
        maximo_pessoas, entradas_unisex_free, entradas_masculino_free, entradas_feminino_free,
        valor_camarote, valor_consumacao, valor_pago, valor_sinal, prazo_sinal_dias, solicitado_por, observacao,
        status_reserva, tag, hora_reserva, data_reserva, lista_convidados // Adicionado data_reserva
    } = req.body;
    const userId = req.user.id;

    // Validação básica
    if (!id_camarote || !nome_cliente) {
        console.error('❌ Dados obrigatórios faltando:', { id_camarote, nome_cliente });
        return res.status(400).json({ error: 'id_camarote e nome_cliente são obrigatórios' });
    }

    const client = await pool.connect();
    try {
        console.log('🔗 Conexão com banco estabelecida');
        await client.query('BEGIN');
        console.log('🔄 Transação iniciada');

        // 1. Criar a reserva na tabela 'reservas' (opcional, pode ser adaptado)
        console.log('📝 Inserindo na tabela reservas...');
        const sqlReserva = `
            INSERT INTO reservas (user_id, evento_id, tipo_reserva, nome_lista, data_reserva, quantidade_convidados, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
        `;
        const reservaParams = [userId, id_evento, 'CAMAROTE', nome_cliente, new Date(), maximo_pessoas, 'ATIVA'];
        console.log('📋 Parâmetros reserva:', reservaParams);
        
        const reservaResult = await client.query(sqlReserva, reservaParams);
        const reservaId = reservaResult.rows[0].id;
        console.log('✅ Reserva criada com ID:', reservaId);

        // 2. Criar o registro na tabela 'reservas_camarote'
        console.log('📝 Inserindo na tabela reservas_camarote...');
        const sqlCamarote = `
            INSERT INTO reservas_camarote (
                id_reserva, id_camarote, nome_cliente, telefone, cpf_cnpj, email, data_nascimento,
                maximo_pessoas, entradas_unisex_free, entradas_masculino_free, entradas_feminino_free,
                valor_camarote, valor_consumacao, valor_pago, valor_sinal, prazo_sinal_dias,
                solicitado_por, observacao, status_reserva, tag, hora_reserva, data_reserva
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22) RETURNING id
        `;
        const camaroteParams = [
            reservaId, id_camarote, nome_cliente, telefone || null, cpf_cnpj || null, email || null, data_nascimento || null,
            maximo_pessoas, entradas_unisex_free || 0, entradas_masculino_free || 0, entradas_feminino_free || 0,
            valor_camarote || 0, valor_consumacao || 0, valor_pago || 0, valor_sinal || 0, prazo_sinal_dias || 0,
            solicitado_por || null, observacao || null, status_reserva || 'pre-reservado', tag || null, hora_reserva || null,
            data_reserva || new Date().toISOString().split('T')[0] // Adicionado data_reserva
        ];
        console.log('📋 Parâmetros camarote:', camaroteParams);
        
        const camaroteResult = await client.query(sqlCamarote, camaroteParams);
        const reservaCamaroteId = camaroteResult.rows[0].id;
        console.log('✅ Reserva de camarote criada com ID:', reservaCamaroteId);

        // 3. Adicionar convidados à lista
        if (lista_convidados && lista_convidados.length > 0) {
            console.log('📝 Adicionando convidados:', lista_convidados.length);
            for (const convidado of lista_convidados) {
                await client.query(
                    'INSERT INTO camarote_convidados (id_reserva_camarote, nome, email) VALUES ($1, $2, $3)',
                    [reservaCamaroteId, convidado.nome, convidado.email]
                );
            }
            console.log('✅ Convidados adicionados');
        }

        await client.query('COMMIT');
        console.log('✅ Transação commitada com sucesso');
        res.status(201).json({ message: 'Reserva de camarote criada com sucesso!', reservaId: reservaCamaroteId });

    } catch (error) {
        console.error('❌ Erro ao criar reserva de camarote:', error);
        console.error('📋 Stack trace:', error.stack);
        
        if (client) {
            await client.query('ROLLBACK');
            console.log('🔄 Transação revertida');
        }
        
        res.status(500).json({ 
            error: 'Erro ao criar reserva de camarote.',
            details: error.message 
        });
    } finally {
        if (client) {
            client.release();
            console.log('🔗 Conexão liberada');
        }
    }
});

// ROTA PARA BUSCAR DETALHES DE UMA RESERVA DE CAMAROTE
router.get('/camarote/:id_reserva_camarote', auth, async (req, res) => {
    const { id_reserva_camarote } = req.params;
    try {
        const reservaCamaroteResult = await pool.query('SELECT * FROM reservas_camarote WHERE id = $1', [id_reserva_camarote]);
        if (!reservaCamaroteResult.rows.length) {
            return res.status(404).json({ message: 'Reserva de camarote não encontrada.' });
        }
        const reservaCamarote = reservaCamaroteResult.rows[0];
        const convidadosResult = await pool.query('SELECT nome, email FROM camarote_convidados WHERE id_reserva_camarote = $1', [id_reserva_camarote]);
        res.status(200).json({ ...reservaCamarote, convidados: convidadosResult.rows });
    } catch (error) {
        console.error('Erro ao buscar reserva de camarote:', error);
        res.status(500).json({ error: 'Erro ao buscar reserva de camarote.' });
    }
});

// ROTA DUPLICADA REMOVIDA - usando a implementação completa abaixo

// ROTA PARA ADICIONAR CONVIDADO A LISTA DO CAMAROTE
router.post('/camarote/:id_reserva_camarote/convidado', auth, async (req, res) => {
    const { id_reserva_camarote } = req.params;
    const { nome, email } = req.body;
    try {
        await pool.query('INSERT INTO camarote_convidados (id_reserva_camarote, nome, email) VALUES ($1, $2, $3)', [id_reserva_camarote, nome, email]);
        res.status(201).json({ message: 'Convidado adicionado com sucesso!' });
    } catch (error) {
        console.error('Erro ao adicionar convidado:', error);
        res.status(500).json({ error: 'Erro ao adicionar convidado.' });
    }
});

// ROTA PARA ATUALIZAR UMA RESERVA DE CAMAROTE
router.put('/camarote/:id_reserva_camarote', auth, async (req, res) => {
    console.log('🔧 === INÍCIO DA ATUALIZAÇÃO NO BACKEND ===');
    console.log('📋 ID da reserva:', req.params.id_reserva_camarote);
    console.log('📤 Dados recebidos:', JSON.stringify(req.body, null, 2));
    console.log('👤 User ID:', req.user?.id);
    
    const { id_reserva_camarote } = req.params;
    const updates = req.body;
    const client = await pool.connect();

    try {
        const allowedFields = [
            'id_camarote', 'id_reserva', 'nome_cliente', 'telefone', 'cpf_cnpj', 'email', 
            'data_nascimento', 'data_reserva', 'data_expiracao', 'maximo_pessoas', 'entradas_unisex_free', 
            'entradas_masculino_free', 'entradas_feminino_free', 'valor_camarote', 
            'valor_consumacao', 'valor_pago', 'valor_sinal', 'prazo_sinal_dias', 
            'solicitado_por', 'observacao', 'status_reserva', 'tag', 'hora_reserva'
        ];
        const updateFields = Object.keys(updates).filter(key => allowedFields.includes(key));

        console.log('📝 Campos permitidos:', allowedFields);
        console.log('📝 Campos a serem atualizados:', updateFields);

        if (updateFields.length === 0) {
            console.log('❌ Nenhum campo válido encontrado');
            return res.status(400).json({ message: 'Nenhum campo válido para atualização fornecido.' });
        }

        const setClause = updateFields.map((field, index) => `${field} = $${index + 1}`).join(', ');
        const values = updateFields.map(field => updates[field]);
        values.push(id_reserva_camarote);

        const sql = `UPDATE reservas_camarote SET ${setClause} WHERE id = $${values.length}`;

        console.log('📝 SQL:', sql);
        console.log('📝 Valores:', values);

        const result = await client.query(sql, values);

        console.log('📊 Resultado da atualização:', {
            rowCount: result.rowCount
        });

        if (result.rowCount === 0) {
            console.log('❌ Nenhuma linha foi afetada');
            return res.status(404).json({ message: 'Reserva de camarote não encontrada.' });
        }

        console.log('✅ Atualização realizada com sucesso!');
        res.status(200).json({ 
            message: 'Reserva de camarote atualizada com sucesso!',
            rowCount: result.rowCount
        });
    } catch (error) {
        console.error('❌ Erro ao atualizar reserva de camarote:', error);
        res.status(500).json({ error: 'Erro ao atualizar reserva de camarote.' });
    } finally {
        if (client) client.release();
    }
});

// ROTA PARA BLOQUEAR UM CAMAROTE (novo)
router.put('/camarotes/:id_camarote/block', auth, async (req, res) => {
    const { id_camarote } = req.params;
    try {
        const result = await pool.query(`UPDATE camarotes SET status = 'bloqueado' WHERE id = $1`, [id_camarote]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Camarote não encontrado.' });
        }
        res.status(200).json({ message: 'Camarote bloqueado com sucesso!' });
    } catch (error) {
        console.error("Erro ao bloquear camarote:", error);
        res.status(500).json({ error: "Erro ao bloquear camarote." });
    }
});


    return {
        router: router,
        checkAndAwardBrindes: checkAndAwardBrindes // Exporta a função
    };
};
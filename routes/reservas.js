
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

    // ==========================================================================================
    // ROTAS DE CAMAROTES (definidas antes de /:id para não serem capturadas por :id)
    // ==========================================================================================
    const liberarCamarotesEventosPassados = async () => {
        try {
            const hoje = new Date().toISOString().split('T')[0];
            await pool.query(`
                UPDATE reservas_camarote rc
                SET status_reserva = 'disponivel',
                    updated_at = CURRENT_TIMESTAMP
                FROM eventos e
                WHERE rc.id_evento = e.id
                AND DATE(e.data_do_evento) < $1
                AND rc.status_reserva != 'disponivel'
                AND rc.status_reserva != 'cancelado'
            `, [hoje]);
        } catch (e) {
            console.warn("liberarCamarotesEventosPassados:", e.message);
        }
    };

    router.get('/camarotes/:id_place', auth, async (req, res) => {
        const { id_place } = req.params;
        try {
            await liberarCamarotesEventosPassados();
        } catch (e) {
            console.warn("liberarCamarotesEventosPassados ignorado:", e.message);
        }
        try {
            // Subquery com DISTINCT ON: uma reserva ativa por camarote (a mais recente)
            const camarotesResult = await pool.query(`
                SELECT c.id, c.nome_camarote, c.capacidade_maxima, c.status,
                    rc.id AS reserva_camarote_id, rc.nome_cliente,
                    rc.entradas_unisex_free, rc.entradas_masculino_free, rc.entradas_feminino_free,
                    rc.valor_camarote, rc.valor_consumacao, rc.valor_pago, rc.valor_sinal,
                    rc.status_reserva, rc.data_reserva, rc.data_expiracao
                FROM camarotes c
                LEFT JOIN (
                    SELECT DISTINCT ON (id_camarote) id, id_camarote, nome_cliente,
                        entradas_unisex_free, entradas_masculino_free, entradas_feminino_free,
                        valor_camarote, valor_consumacao, valor_pago, valor_sinal,
                        status_reserva, data_reserva, data_expiracao
                    FROM reservas_camarote
                    WHERE status_reserva NOT IN ('disponivel', 'cancelado')
                    ORDER BY id_camarote, id DESC
                ) rc ON rc.id_camarote = c.id
                WHERE c.id_place = $1
                ORDER BY c.nome_camarote
            `, [id_place]);
            res.status(200).json(camarotesResult.rows);
        } catch (error) {
            console.error("Erro ao buscar camarotes:", error);
            res.status(500).json({
                error: "Erro ao buscar camarotes",
                details: error.message
            });
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


// ROTA PARA CRIAR UMA NOVA RESERVA DE CAMAROTE
router.post('/camarote', auth, async (req, res) => {
    console.log('🔍 Iniciando criação de reserva de camarote...');
    console.log('📤 Body recebido:', JSON.stringify(req.body, null, 2));
    console.log('👤 User ID:', req.user.id);
    
    const { 
        id_camarote, nome_cliente, telefone, cpf_cnpj, email, data_nascimento,
        maximo_pessoas, entradas_unisex_free, entradas_masculino_free, entradas_feminino_free,
        valor_camarote, valor_consumacao, valor_pago, valor_sinal, prazo_sinal_dias, solicitado_por, observacao,
        status_reserva, tag, hora_reserva, data_reserva, data_expiracao, lista_convidados
    } = req.body;
    const userId = req.user.id;

    // Validação básica
    if (!id_camarote || !nome_cliente) {
        console.error('❌ Dados obrigatórios faltando:', { id_camarote, nome_cliente });
        return res.status(400).json({ 
            success: false,
            error: 'id_camarote e nome_cliente são obrigatórios' 
        });
    }

    // Validar se o camarote existe
    let client;
    try {
        client = await pool.connect();
        console.log('🔗 Conexão com banco estabelecida');
        await client.query('BEGIN');
        console.log('🔄 Transação iniciada');

        // Verificar se o camarote existe e obter nome_camarote + id_place (para criar reserva no calendário)
        const camaroteCheck = await client.query(
            'SELECT id, id_place, nome_camarote FROM camarotes WHERE id = $1',
            [id_camarote]
        );
        
        if (camaroteCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(404).json({
                success: false,
                error: 'Camarote não encontrado'
            });
        }
        const idPlace = camaroteCheck.rows[0].id_place;
        const nomeCamarote = camaroteCheck.rows[0].nome_camarote || ('Camarote-' + id_camarote);

        // Preparar data_reserva e data_expiracao
        const dataReservaFinal = data_reserva 
            ? (data_reserva.includes('T') ? data_reserva.split('T')[0] : data_reserva)
            : new Date().toISOString().split('T')[0];
        
        const dataExpiracaoFinal = data_expiracao 
            ? (data_expiracao.includes('T') ? data_expiracao.split('T')[0] : data_expiracao)
            : null;
        
        // Converter hora_reserva para formato TIME se necessário
        let horaReservaFinal = hora_reserva || null;
        if (horaReservaFinal && !horaReservaFinal.includes(':')) {
            horaReservaFinal = null;
        }
        if (horaReservaFinal && horaReservaFinal.length === 5) {
            horaReservaFinal = horaReservaFinal + ':00';
        }

        // 1. Criar registro na tabela 'reservas' primeiro (necessário para id_reserva NOT NULL)
        // Usar 'NORMAL' como tipo_reserva (valor válido do enum: 'ANIVERSARIO', 'PROMOTER', 'NORMAL')
        console.log('📝 Criando registro na tabela reservas...');
        const sqlReserva = `
            INSERT INTO reservas (user_id, tipo_reserva, nome_lista, data_reserva, evento_id, quantidade_convidados, codigo_convite)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
        `;
        const reservaParams = [
            userId,
            'NORMAL', // Usar 'NORMAL' como tipo válido do enum (valores válidos: 'ANIVERSARIO', 'PROMOTER', 'NORMAL')
            nome_cliente,
            dataReservaFinal,
            null, // evento_id
            maximo_pessoas || 0,
            null // codigo_convite
        ];
        
        console.log('📋 Parâmetros reserva:', reservaParams);
        const reservaResult = await client.query(sqlReserva, reservaParams);
        const reservaId = reservaResult.rows[0].id;
        console.log('✅ Reserva criada com ID:', reservaId);

        // 2. Criar o registro na tabela 'reservas_camarote' com id_reserva
        console.log('📝 Inserindo na tabela reservas_camarote...');
        const sqlCamarote = `
            INSERT INTO reservas_camarote (
                id_reserva, id_camarote, nome_cliente, telefone, cpf_cnpj, email, data_nascimento,
                maximo_pessoas, entradas_unisex_free, entradas_masculino_free, entradas_feminino_free,
                valor_camarote, valor_consumacao, valor_pago, valor_sinal, prazo_sinal_dias,
                solicitado_por, observacao, status_reserva, tag, hora_reserva, data_reserva, data_expiracao
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23) RETURNING id
        `;
        
        const camaroteParams = [
            reservaId, // id_reserva (obrigatório)
            id_camarote, 
            nome_cliente, 
            telefone || null, 
            cpf_cnpj || null, 
            email || null, 
            data_nascimento || null,
            maximo_pessoas || 0, 
            entradas_unisex_free || 0, 
            entradas_masculino_free || 0, 
            entradas_feminino_free || 0,
            valor_camarote || 0, 
            valor_consumacao || 0, 
            valor_pago || 0, 
            valor_sinal || 0, 
            prazo_sinal_dias || 0,
            solicitado_por || null, 
            observacao || null, 
            status_reserva || 'pre-reservado', 
            tag || null, 
            horaReservaFinal,
            dataReservaFinal,
            dataExpiracaoFinal
        ];
        
        console.log('📋 Parâmetros camarote:', camaroteParams);
        
        const camaroteResult = await client.query(sqlCamarote, camaroteParams);
        const reservaCamaroteId = camaroteResult.rows[0].id;
        console.log('✅ Reserva de camarote criada com ID:', reservaCamaroteId);

        // Adicionar convidados à lista
        if (lista_convidados && Array.isArray(lista_convidados) && lista_convidados.length > 0) {
            console.log('📝 Adicionando convidados:', lista_convidados.length);
            for (const convidado of lista_convidados) {
                if (convidado.nome && convidado.nome.trim()) {
                    await client.query(
                        'INSERT INTO camarote_convidados (id_reserva_camarote, nome, email) VALUES ($1, $2, $3)',
                        [reservaCamaroteId, convidado.nome.trim(), convidado.email || null]
                    );
                }
            }
            console.log('✅ Convidados adicionados');
        }

        // Verificação de lotação ANTES do commit (se falhar, podemos fazer rollback)
        let lotacaoOk = true;
        try {
            const areaWhere = idPlace === 9 ? "ra.name ILIKE 'Reserva Rooftop - %'" : "ra.name NOT ILIKE 'Reserva Rooftop - %'";
            const capacityResult = await client.query(`
                SELECT (COALESCE(SUM(ra.capacity_dinner), 0) + COALESCE(SUM(ra.capacity_lunch), 0))::int as total_cap
                FROM restaurant_areas ra
                WHERE ra.is_active = TRUE AND (${areaWhere})
            `);
            const totalCap = Math.max(0, parseInt(capacityResult.rows[0]?.total_cap, 10) || 99999);
            const currentResult = await client.query(`
                SELECT COALESCE(SUM(number_of_people), 0)::int as total_people
                FROM restaurant_reservations
                WHERE reservation_date = $1 AND establishment_id = $2
                AND status NOT IN ('cancelled', 'CANCELADA', 'completed', 'no_show')
            `, [dataReservaFinal, idPlace]);
            const currentPeople = Math.max(0, parseInt(currentResult.rows[0]?.total_people, 10) || 0);
            const maximoPessoas = Math.max(0, parseInt(maximo_pessoas, 10) || 0);
            if (totalCap > 0 && currentPeople + maximoPessoas > totalCap) {
                lotacaoOk = false;
            }
        } catch (lotacaoErr) {
            console.warn('Verificação de lotação ignorada:', lotacaoErr.message);
        }
        if (!lotacaoOk) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(400).json({
                success: false,
                error: 'Lotação do estabelecimento para esta data não permite mais esta quantidade de pessoas. Ajuste a data ou o número de pessoas.'
            });
        }

        // ----- Sincronizar com Calendário de Restaurante + Lista de Convidados -----
        // Usa SAVEPOINT: se o sync falhar, desfazemos só o sync; a reserva de camarote permanece.
        await client.query('SAVEPOINT before_sync');
        let syncOk = false;
        try {
            const notesRR = (observacao && observacao.trim()) ? observacao.trim() : 'Reserva Camarote';
            const maximoPessoas = Math.max(1, parseInt(maximo_pessoas, 10) || 1);
            let rrResult;
            const insertRRFull = `
                INSERT INTO restaurant_reservations (
                    client_name, client_phone, client_email, data_nascimento_cliente, reservation_date,
                    reservation_time, number_of_people, area_id, table_number,
                    status, origin, notes, created_by, establishment_id, evento_id, blocks_entire_area,
                    area_display_name, has_bistro_table
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id
            `;
            const rrParamsFull = [
                nome_cliente, telefone || null, email || null, data_nascimento || null,
                dataReservaFinal, horaReservaFinal || '20:00:00', maximoPessoas, null, nomeCamarote,
                'confirmed', 'CAMAROTE', notesRR, userId, idPlace, null, false, null, false
            ];
            try {
                rrResult = await client.query(insertRRFull, rrParamsFull);
            } catch (insertErr) {
                // Fallback: INSERT mínimo (colunas básicas) se o schema não tiver colunas opcionais
                if (insertErr.message && (insertErr.message.includes('column') || insertErr.message.includes('does not exist'))) {
                    console.warn('Insert completo falhou, tentando fallback mínimo:', insertErr.message);
                    rrResult = await client.query(`
                        INSERT INTO restaurant_reservations (
                            client_name, client_phone, client_email, reservation_date, reservation_time,
                            number_of_people, table_number, status, origin, notes, created_by, establishment_id
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id
                    `, [
                        nome_cliente, telefone || null, email || null, dataReservaFinal, horaReservaFinal || '20:00:00',
                        maximoPessoas, nomeCamarote, 'confirmed', 'CAMAROTE', notesRR, userId, idPlace
                    ]);
                } else {
                    throw insertErr;
                }
            }
            const restaurantReservationId = rrResult.rows[0].id;
            console.log('✅ Reserva de restaurante (calendário) criada com ID:', restaurantReservationId);

            await client.query(
                'UPDATE reservas_camarote SET restaurant_reservation_id = $1 WHERE id = $2',
                [restaurantReservationId, reservaCamaroteId]
            );

            const crypto = require('crypto');
            const token = crypto.randomBytes(24).toString('hex');
            const expirationDate = new Date(dataReservaFinal + 'T00:00:00');
            expirationDate.setDate(expirationDate.getDate() + 1);
            expirationDate.setHours(23, 59, 59, 0);
            const expiresAt = expirationDate.toISOString().slice(0, 19).replace('T', ' ');

            const glResult = await client.query(
                `INSERT INTO guest_lists (reservation_id, reservation_type, event_type, shareable_link_token, expires_at)
                 VALUES ($1, 'restaurant', $2, $3, $4) RETURNING id`,
                [restaurantReservationId, null, token, expiresAt]
            );
            const guestListId = glResult.rows[0]?.id;
            if (guestListId) {
                try {
                    await client.query(
                        'INSERT INTO guests (guest_list_id, name, whatsapp) VALUES ($1, $2, $3)',
                        [guestListId, nome_cliente || 'Cliente', null]
                    );
                    if (lista_convidados && Array.isArray(lista_convidados)) {
                        for (const c of lista_convidados) {
                            if (c.nome && c.nome.trim() && c.nome.trim() !== nome_cliente) {
                                await client.query(
                                    'INSERT INTO guests (guest_list_id, name, whatsapp) VALUES ($1, $2, $3)',
                                    [guestListId, c.nome.trim(), null]
                                );
                            }
                        }
                    }
                } catch (guestErr) {
                    console.warn('Erro ao inserir guests (tentando colunas extras):', guestErr.message);
                    try {
                        await client.query(
                            `INSERT INTO guests (guest_list_id, name, whatsapp, is_owner, qr_code_token) 
                             VALUES ($1, $2, $3, $4, $5)`,
                            [guestListId, nome_cliente || 'Cliente', null, true, 'vc_guest_' + crypto.randomBytes(24).toString('hex')]
                        );
                        if (lista_convidados && Array.isArray(lista_convidados)) {
                            for (const c of lista_convidados) {
                                if (c.nome && c.nome.trim() && c.nome.trim() !== nome_cliente) {
                                    await client.query(
                                        'INSERT INTO guests (guest_list_id, name, whatsapp, is_owner, qr_code_token) VALUES ($1, $2, $3, $4, $5)',
                                        [guestListId, c.nome.trim(), null, false, null]
                                    );
                                }
                            }
                        }
                    } catch (e2) {
                        throw guestErr;
                    }
                }
                console.log('✅ Lista de convidados (guest_lists + guests) vinculada à reserva do calendário');
            }
            syncOk = true;
            await client.query('RELEASE SAVEPOINT before_sync');
        } catch (syncErr) {
            console.error('❌ Erro ao sincronizar com calendário:', syncErr);
            await client.query('ROLLBACK TO SAVEPOINT before_sync');
        }

        await client.query('COMMIT');
        console.log('✅ Reserva de camarote commitada com sucesso (camarote travado)' + (syncOk ? ' + calendário + lista de convidados' : ' [sync calendário falhou]'));
        
        // Buscar a reserva criada para retornar dados completos (após commit)
        const reservaCriada = await client.query(
            `SELECT rc.*, c.nome_camarote, c.capacidade_maxima 
             FROM reservas_camarote rc 
             LEFT JOIN camarotes c ON rc.id_camarote = c.id 
             WHERE rc.id = $1`,
            [reservaCamaroteId]
        );
        
        res.status(201).json({ 
            success: true,
            message: syncOk ? 'Reserva de camarote criada com sucesso! Aparece no calendário e na lista de convidados.' : 'Reserva de camarote criada! O camarote está travado. (Calendário/lista de convidados não foram sincronizados.)',
            data: reservaCriada.rows[0],
            reservaId: reservaCamaroteId,
            syncCalendarioOk: syncOk
        });

    } catch (error) {
        console.error('❌ Erro ao criar reserva de camarote:', error);
        console.error('📋 Stack trace:', error.stack);
        console.error('📋 Mensagem de erro:', error.message);
        
        if (client) {
            try {
                await client.query('ROLLBACK');
                console.log('🔄 Transação revertida');
            } catch (rollbackError) {
                console.error('❌ Erro ao fazer rollback:', rollbackError);
            }
        }
        
        res.status(500).json({ 
            success: false,
            error: 'Erro ao criar reserva de camarote.',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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
        await client.query('BEGIN');
        
        const allowedFields = [
            'id_camarote', 'nome_cliente', 'telefone', 'cpf_cnpj', 'email', 
            'data_nascimento', 'data_reserva', 'data_expiracao', 'maximo_pessoas', 'entradas_unisex_free', 
            'entradas_masculino_free', 'entradas_feminino_free', 'valor_camarote', 
            'valor_consumacao', 'valor_pago', 'valor_sinal', 'prazo_sinal_dias', 
            'solicitado_por', 'observacao', 'status_reserva', 'tag', 'hora_reserva'
        ];
        
        // Filtrar apenas campos permitidos e que não são null/undefined
        const updateFields = Object.keys(updates)
            .filter(key => allowedFields.includes(key) && updates[key] !== undefined);

        console.log('📝 Campos permitidos:', allowedFields);
        console.log('📝 Campos a serem atualizados:', updateFields);

        if (updateFields.length === 0) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(400).json({ 
                success: false,
                error: 'Nenhum campo válido para atualização fornecido.' 
            });
        }

        // Preparar valores, tratando datas e horas
        const values = [];
        const setClauseParts = [];
        
        updateFields.forEach((field, index) => {
            let value = updates[field];
            
            // Tratar datas
            if (field === 'data_reserva' || field === 'data_expiracao' || field === 'data_nascimento') {
                if (value && typeof value === 'string') {
                    value = value.includes('T') ? value.split('T')[0] : value;
                }
            }
            
            // Tratar hora_reserva
            if (field === 'hora_reserva' && value) {
                if (typeof value === 'string' && value.length === 5) {
                    value = value + ':00';
                }
            }
            
            setClauseParts.push(`${field} = $${index + 1}`);
            values.push(value);
        });
        
        values.push(id_reserva_camarote);
        const setClause = setClauseParts.join(', ');
        const sql = `UPDATE reservas_camarote SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length} RETURNING *`;

        console.log('📝 SQL:', sql);
        console.log('📝 Valores:', values);

        const result = await client.query(sql, values);

        console.log('📊 Resultado da atualização:', {
            rowCount: result.rowCount
        });

        if (result.rowCount === 0) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(404).json({ 
                success: false,
                error: 'Reserva de camarote não encontrada.' 
            });
        }

        // Sincronizar com reserva do calendário (cascata): atualizar ou cancelar restaurant_reservation
        try {
            const linkResult = await client.query(
                'SELECT restaurant_reservation_id, status_reserva, id_camarote FROM reservas_camarote WHERE id = $1',
                [id_reserva_camarote]
            );
            const hasLink = linkResult.rows[0]?.restaurant_reservation_id;
            const newStatusReserva = updates.status_reserva !== undefined ? updates.status_reserva : linkResult.rows[0]?.status_reserva;
            if (hasLink) {
                const cancelStatuses = ['disponivel', 'cancelado'];
                if (cancelStatuses.includes(String(newStatusReserva).toLowerCase())) {
                    await client.query(
                        "UPDATE restaurant_reservations SET status = 'cancelled' WHERE id = $1",
                        [linkResult.rows[0].restaurant_reservation_id]
                    );
                    console.log('✅ Reserva do calendário cancelada em cascata (reserva camarote cancelada/liberada)');
                } else {
                    const row = await client.query(
                        `SELECT rc.nome_cliente, rc.telefone, rc.data_reserva, rc.hora_reserva, rc.maximo_pessoas, rc.observacao, c.nome_camarote
                         FROM reservas_camarote rc LEFT JOIN camarotes c ON c.id = rc.id_camarote WHERE rc.id = $1`,
                        [id_reserva_camarote]
                    );
                    const r = row.rows[0];
                    const nomeCamarote = r?.nome_camarote || ('Camarote-' + (r?.id_camarote || ''));
                    const dataReserva = r?.data_reserva ? (String(r.data_reserva).includes('T') ? String(r.data_reserva).split('T')[0] : String(r.data_reserva)) : null;
                    let horaReserva = r?.hora_reserva;
                    if (horaReserva && String(horaReserva).length === 5) horaReserva = String(horaReserva) + ':00';
                    await client.query(
                        `UPDATE restaurant_reservations SET client_name = $1, client_phone = $2, reservation_date = $3, reservation_time = $4, number_of_people = $5, table_number = $6, notes = $7 WHERE id = $8`,
                        [r?.nome_cliente || null, r?.telefone || null, dataReserva, horaReserva, r?.maximo_pessoas || 1, nomeCamarote, (r?.observacao && r.observacao.trim()) ? r.observacao.trim() : 'Reserva Camarote', linkResult.rows[0].restaurant_reservation_id]
                    );
                    console.log('✅ Reserva do calendário atualizada em cascata');
                }
            }
        } catch (cascadeErr) {
            console.warn('⚠️ Sincronização com calendário (cascata) ignorada:', cascadeErr.message);
            // Não falha a atualização da reserva de camarote se a coluna restaurant_reservation_id não existir ou outro erro
        }

        await client.query('COMMIT');
        
        // Buscar dados completos da reserva atualizada
        const reservaAtualizada = await pool.query(
            `SELECT rc.*, c.nome_camarote, c.capacidade_maxima 
             FROM reservas_camarote rc 
             LEFT JOIN camarotes c ON rc.id_camarote = c.id 
             WHERE rc.id = $1`,
            [id_reserva_camarote]
        );

        console.log('✅ Atualização realizada com sucesso!');
        res.status(200).json({ 
            success: true,
            message: 'Reserva de camarote atualizada com sucesso!',
            data: reservaAtualizada.rows[0],
            rowCount: result.rowCount
        });
    } catch (error) {
        console.error('❌ Erro ao atualizar reserva de camarote:', error);
        console.error('📋 Stack trace:', error.stack);
        
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('❌ Erro ao fazer rollback:', rollbackError);
            }
        }
        
        res.status(500).json({ 
            success: false,
            error: 'Erro ao atualizar reserva de camarote.',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    } finally {
        if (client) {
            client.release();
            console.log('🔗 Conexão liberada');
        }
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
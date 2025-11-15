const fs = require('fs');
const express = require('express');
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken');
const path = require("path");
const authenticateToken = require('../middleware/auth');


const router = express.Router();
const baseUrl = process.env.API_BASE_URL || 'https://vamos-comemorar-api.onrender.com';

// Função auxiliar para adicionar a URL completa das imagens ao objeto do usuário
const addFullImageUrlsToUser = (user) => {
    if (!user) return user;
    return {
        ...user,
        foto_perfil_url: user.foto_perfil 
            ? `${baseUrl}/uploads/${user.foto_perfil}` 
            : null,
    };
};


module.exports = (pool, upload) => { 

    // Cadastro de usuário
    router.post('/', async (req, res) => {
        const { name, email, cpf, password, profileImageUrl, telefone } = req.body;
    
        try {
            const hashedPassword = await bcrypt.hash(password, 10);
    
            const result = await pool.query(
                'INSERT INTO users (name, email, cpf, password, foto_perfil, telefone) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
                [name, email, cpf, hashedPassword, profileImageUrl, telefone]
            );
    
            const userId = result.rows[0].id;
            console.log('JWT_SECRET:', process.env.JWT_SECRET);
            // Gera o token JWT
            const token = jwt.sign(
                { id: userId, email, role: 'cliente' }, // Adicionado role padrão
                process.env.JWT_SECRET || 'chave_secreta',
                { expiresIn: '7d' }
            );
    
            res.status(201).json({
                token,
                userId,
                name,
                email,
                cpf,
                profileImageUrl,
                telefone
            });
        } catch (error) {
            console.error('Erro ao cadastrar usuário:', error);
            res.status(500).json({ error: 'Erro ao cadastrar usuário' });
        }
    });

    
    // ATUALIZAR DADOS DO USUÁRIO LOGADO COM UPLOAD DE FOTO
    // Esta rota agora é robusta para lidar com os dados do Flutter
    router.put('/me', authenticateToken, async (req, res) => {
        const userId = req.user.id; 
        const { 
            name, email, telefone, sexo, data_nascimento, cpf, 
            endereco, numero, bairro, cidade, estado, complemento, 
            password, foto_perfil // Recebe o nome do arquivo do Flutter
        } = req.body;
    
        try {
            const updates = [];
            const params = [];
    
            // Adicionamos os campos de texto se estiverem presentes
            let paramIndex = 1;
            if (name) { updates.push(`name = $${paramIndex++}`); params.push(name); }
            if (email) { updates.push(`email = $${paramIndex++}`); params.push(email); }
            if (telefone) { updates.push(`telefone = $${paramIndex++}`); params.push(telefone); }
            if (sexo) { updates.push(`sexo = $${paramIndex++}`); params.push(sexo); }
            if (data_nascimento) { updates.push(`data_nascimento = $${paramIndex++}`); params.push(data_nascimento); }
            if (cpf) { updates.push(`cpf = $${paramIndex++}`); params.push(cpf); }
            if (endereco) { updates.push(`endereco = $${paramIndex++}`); params.push(endereco); }
            if (numero) { updates.push(`numero = $${paramIndex++}`); params.push(numero); }
            if (bairro) { updates.push(`bairro = $${paramIndex++}`); params.push(bairro); }
            if (cidade) { updates.push(`cidade = $${paramIndex++}`); params.push(cidade); }
            if (estado) { updates.push(`estado = $${paramIndex++}`); params.push(estado); }
            if (complemento) { updates.push(`complemento = $${paramIndex++}`); params.push(complemento); }

            // Verifica se o Flutter enviou o nome do arquivo da foto para atualização
            if (foto_perfil) { 
                updates.push(`foto_perfil = $${paramIndex++}`);
                params.push(foto_perfil);
                console.log("PUT /me - Nome do arquivo de perfil a ser salvo no DB:", foto_perfil);
            }
            
            // Atualiza a senha se fornecida
            if (password) {
                const hashedPassword = await bcrypt.hash(password, 10);
                updates.push(`password = $${paramIndex++}`);
                params.push(hashedPassword);
            }
    
            if (updates.length === 0) {
                return res.status(400).json({ message: 'Nenhum dado a ser atualizado.' });
            }
    
            const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`;
            params.push(userId); // Adiciona o ID do usuário no final

            console.log("PUT /me - Query SQL executada:", query);
            console.log("PUT /me - Parâmetros SQL:", params);

            const result = await pool.query(query, params);
    
            if (result.rowCount === 0) {
                return res.status(404).json({ message: 'Usuário não encontrado.' });
            }
    
            res.json({ message: 'Dados do usuário logado atualizados com sucesso.' });
        } catch (error) {
            console.error('ERRO ao atualizar dados do usuário logado (PUT /me):', error);
            res.status(500).json({ error: 'Erro interno do servidor ao atualizar perfil.' });
        }
    });


    // Listar usuários
    router.get('/', async (req, res) => {
        try {
            const result = await pool.query('SELECT id, name, email, foto_perfil, role FROM users');
            
            // Mapeia os resultados para adicionar a URL completa da imagem
            const usersWithUrls = result.rows.map(addFullImageUrlsToUser);
            
            res.json(usersWithUrls);
        } catch (err) {
            console.error('Erro ao listar usuários:', err);
            res.status(500).json({ error: 'Erro ao listar usuários' });
        }
    });

    // Rota para buscar os dados do usuário logado
    router.get('/me', authenticateToken, async (req, res) => {
        try {
            const userId = req.user.id;
            const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
            
            if (result.rows.length === 0) {
                return res.status(404).json({ message: 'Usuário não encontrado.' });
            }

            const user = result.rows[0];

            // Usamos a função auxiliar para adicionar a URL da imagem
            const userWithUrl = addFullImageUrlsToUser(user);
            
            // Remove a senha antes de enviar a resposta
            delete userWithUrl.password; 

            res.json(userWithUrl);
        } catch (error) {
            console.error('Erro ao buscar dados do usuário logado:', error);
            res.status(500).json({ error: 'Erro ao buscar dados do usuário.' });
        }
    });

    // Deletar usuário
    router.delete('/:id', async (req, res) => {
        const userId = req.params.id;

        try {
            const result = await pool.query('DELETE FROM users WHERE id = $1', [userId]);
            if (result.rowCount === 0) {
                return res.status(404).json({ message: 'Usuário não encontrado.' });
            }
            res.json({ message: 'Usuário deletado com sucesso.' });
        } catch (error) {
            console.error('Erro ao deletar usuário:', error);
            res.status(500).json({ error: 'Erro ao deletar usuário.' });
        }
    });


    // Rota para login
    router.post('/login', async (req, res) => {
        const { access, password } = req.body;
        console.log('Login - Acesso:', access);
        console.log('Login - Password:', password);

        try {
            const result = await pool.query(
                'SELECT * FROM users WHERE email = $1 OR cpf = $2',
                [access, access]
            );
            console.log('Login - Resultados da consulta:', result.rows);

            if (result.rows.length === 0) {
                console.log('Login - Usuário não encontrado');
                return res.status(404).json({ error: 'Usuário não encontrado' });
            }

            const user = result.rows[0];
            const isPasswordValid = await bcrypt.compare(password, user.password);
            console.log('Login - Senha válida:', isPasswordValid);

            if (!isPasswordValid) {
                return res.status(401).json({ error: 'Credenciais inválidas' });
            }

            // Geração do token com role incluído
            const token = jwt.sign(
                { id: user.id, email: user.email, role: user.role },
                process.env.JWT_SECRET || 'chave_secreta',
                { expiresIn: '7d' }
            );

            // Retornar também o tipo de usuário (role) na resposta
            res.json({
                token,
                userId: user.id,
                role: user.role,
                nome: user.name 
            });
        } catch (error) {
            console.error('Erro ao realizar login:', error);
            res.status(500).json({ error: 'Erro ao realizar login' });
        }
    });

    // Atualizar dados de um usuário específico (PUT) - Geralmente para admin
    router.put('/:id', authenticateToken, async (req, res) => {
        const userId = req.params.id; 
        const { 
            name, email, telefone, sexo, data_nascimento, cpf, 
            endereco, numero, bairro, cidade, estado, complemento, 
            password, foto_perfil
        } = req.body;

        console.log("PUT /:id - Dados recebidos:", req.body);

        try {
            // Verifica se o usuário logado tem permissão (ex: é admin) para atualizar outros usuários
            if (req.user.role !== 'admin' && req.user.id.toString() !== userId) { 
                return res.status(403).json({ message: 'Acesso negado. Você só pode atualizar seu próprio perfil.' });
            }

            const updates = [];
            const params = [];
            let paramIndex = 1;

            if (name) { updates.push(`name = $${paramIndex++}`); params.push(name); }
            if (email) { updates.push(`email = $${paramIndex++}`); params.push(email); }
            if (telefone) { updates.push(`telefone = $${paramIndex++}`); params.push(telefone); }
            if (sexo) { updates.push(`sexo = $${paramIndex++}`); params.push(sexo); }
            if (data_nascimento) { updates.push(`data_nascimento = $${paramIndex++}`); params.push(data_nascimento); }
            if (cpf) { updates.push(`cpf = $${paramIndex++}`); params.push(cpf); }
            if (endereco) { updates.push(`endereco = $${paramIndex++}`); params.push(endereco); }
            if (numero) { updates.push(`numero = $${paramIndex++}`); params.push(numero); }
            if (bairro) { updates.push(`bairro = $${paramIndex++}`); params.push(bairro); }
            if (cidade) { updates.push(`cidade = $${paramIndex++}`); params.push(cidade); }
            if (estado) { updates.push(`estado = $${paramIndex++}`); params.push(estado); }
            if (complemento) { updates.push(`complemento = $${paramIndex++}`); params.push(complemento); }
            
            if (foto_perfil) { 
                updates.push(`foto_perfil = $${paramIndex++}`); 
                params.push(foto_perfil);
                console.log("PUT /:id - Nome do arquivo de perfil a ser salvo no DB:", foto_perfil);
            }

            // Atualiza a senha se fornecida
            if (password) {
                const hashedPassword = await bcrypt.hash(password, 10);
                updates.push(`password = $${paramIndex++}`);
                params.push(hashedPassword);
            }

            if (updates.length === 0) {
                return res.status(400).json({ message: 'Nenhum dado a ser atualizado.' });
            }

            const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`;
            params.push(userId);
            console.log("PUT /:id - Query SQL executada:", query);
            console.log("PUT /:id - Parâmetros SQL:", params);

            const result = await pool.query(query, params);

            if (result.rowCount === 0) {
                return res.status(404).json({ message: 'Usuário não encontrado.' });
            }

            res.json({ message: 'Dados e foto de perfil do usuário atualizados com sucesso.' });
        } catch (error) {
            console.error('ERRO CRÍTICO ao atualizar dados do usuário (PUT /:id):', error);
            res.status(500).json({ error: 'Erro interno do servidor ao atualizar usuário.' });
        }
    });

    /**
 * @route   GET /api/users/:id/reservas
 * @desc    Busca todas as reservas criadas por um usuário específico
 * @access  Private (Admin ou o próprio usuário)
 */
    router.get('/:id/reservas', authenticateToken, async (req, res) => {
        const userIdToFetch = req.params.id;
        const loggedInUser = req.user; 

        if (loggedInUser.role !== 'admin' && loggedInUser.role !== 'gerente' && loggedInUser.id.toString() !== userIdToFetch) {
            return res.status(403).json({ message: 'Acesso negado. Você não tem permissão para ver as reservas deste usuário.' });
        }

        try {
            const sql = `
                SELECT 
                    r.*,
                    (SELECT COUNT(*) FROM convidados c WHERE c.reserva_id = r.id) as quantidade_convidados,
                    (SELECT COUNT(*) FROM convidados c WHERE c.reserva_id = r.id AND c.status = 'CHECK-IN') as quantidade_checkins
                FROM 
                    reservas r
                WHERE 
                    r.user_id = $1
                ORDER BY 
                    r.data_reserva DESC;
            `;

            const result = await pool.query(sql, [userIdToFetch]);

            if (result.rows.length === 0) {
                return res.status(200).json([]);
            }

            res.status(200).json(result.rows);

        } catch (error) {
            console.error(`Erro ao buscar reservas para o usuário ${userIdToFetch}:`, error);
            res.status(500).json({ error: 'Erro ao buscar as reservas do usuário.' });
        }
    });

    return router;
};
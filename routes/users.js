const fs = require('fs');
const express = require('express');
const bcrypt = require('bcryptjs'); // Usar apenas bcrypt.hash, não bcryptjs duplicado
const jwt = require('jsonwebtoken');
// const multer = require("multer"); // REMOVA esta linha, Multer já é passado como parâmetro
const path = require("path");
const authenticateToken = require('../middleware/auth');


// --- REMOVA TODAS ESTAS LINHAS DUPLICADAS E DESNECESSÁRIAS ---
// const rootPath = path.resolve(__dirname, '..');
// const upload = multer({
//     storage: multer.diskStorage({
//         destination: (req, file, cb) => cb(null, path.join(rootPath, 'uploads')),
//         filename: (req, file, cb) => {
//             const timestamp = Date.now();
//             const ext = path.extname(file.originalname);
//             const filename = `${timestamp}${ext}`;
//             cb(null, filename);
//         },
//     }),
//     limits: { fileSize: 20 * 1024 * 1024 },
// });
// -----------------------------------------------------------------

const router = express.Router();
// --- REMOVA ESTA LINHA TAMBÉM ---
// const IMAGE_DIRECTORY = path.join(__dirname, 'uploads');


// ------------------------------

module.exports = (pool, upload) => { // 'upload' AQUI É A INSTÂNCIA 'generalUpload' DO server.js


        // --- ADICIONE ESTA NOVA FUNÇÃO AUXILIAR ---
    const addFullImageUrlsToUser = (user) => {
        if (!user) return user;
        const baseUrl = process.env.API_BASE_URL || 'https://vamos-comemorar-api.onrender.com';
        return {
            ...user,
            // A API vai criar e retornar o campo foto_perfil_url
            foto_perfil_url: user.foto_perfil 
                ? `${baseUrl}/uploads/${user.foto_perfil}` 
                : null,
        };
    };
    
    // Cadastro de usuário
    router.post('/', async (req, res) => {
        const { name, email, cpf, password, profileImageUrl, telefone } = req.body;
    
        try {
            const hashedPassword = await bcrypt.hash(password, 10);
    
            const [result] = await pool.query(
                'INSERT INTO users (name, email, cpf, password, foto_perfil, telefone) VALUES (?, ?, ?, ?, ?)',
                [name, email, cpf, hashedPassword, profileImageUrl, telefone]
            );
    
            const userId = result.insertId;
            console.log('JWT_SECRET:', process.env.JWT_SECRET);
            // Gera o token JWT
            const token = jwt.sign(
                { id: userId, email },
                process.env.JWT_SECRET || 'chave_secreta',
                { expiresIn: '1h' }
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

    
    // Atualizar dados do usuário logado (PATCH)
    // Se o Flutter usa PUT com Multer, esta rota PATCH não será usada para upload de imagem.
    // Sugestão: Se não usa Base64 em nenhum lugar, remova a lógica 'if (foto_perfil) { ... }' daqui.
    router.patch('/me', authenticateToken, async (req, res) => {
        const userId = req.user.id; 
        const { name, email, telefone, sexo, data_nascimento, cpf, endereco, numero, bairro, cidade, estado, complemento, foto_perfil } = req.body;
    
        try {
            const updates = [];
            const params = [];
    
            if (name) { updates.push('name = ?'); params.push(name); }
            if (email) { updates.push('email = ?'); params.push(email); }
            if (telefone) { updates.push('telefone = ?'); params.push(telefone); }
            if (sexo) { updates.push('sexo = ?'); params.push(sexo); }
            if (data_nascimento) { updates.push('data_nascimento = ?'); params.push(data_nascimento); }
            if (cpf) { updates.push('cpf = ?'); params.push(cpf); }
            if (endereco) { updates.push('endereco = ?'); params.push(endereco); }
            if (numero) { updates.push('numero = ?'); params.push(numero); }
            if (bairro) { updates.push('bairro = ?'); params.push(bairro); }
            if (cidade) { updates.push('cidade = ?'); params.push(cidade); }
            if (estado) { updates.push('estado = ?'); params.push(estado); }
            if (complemento) { updates.push('complemento = ?'); params.push(complemento); }
    
            if (foto_perfil) { // Esta é a lógica para Base64. CUIDADO se o Flutter não enviar assim!
                const base64Data = foto_perfil.replace(/^data:image\/\w+;base64,/, "");
                const buffer = Buffer.from(base64Data, 'base64');
                const filename = `${Date.now()}.jpg`;
                // path.join(__dirname, '..', 'uploads') seria mais consistente para o diretório de uploads.
                fs.writeFileSync(path.join(path.resolve(__dirname, '..', 'uploads'), filename), buffer); // Salvando no diretório 'uploads' na raiz do projeto
                updates.push('foto_perfil = ?');
                params.push(filename);
            }
    
            params.push(userId);
    
            if (updates.length === 0) {
                return res.status(400).json({ message: 'Nenhum dado a ser atualizado.' });
            }
    
            const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
            const [result] = await pool.query(query, params);
    
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Usuário não encontrado.' });
            }
    
            res.json({ message: 'Dados do usuário logado atualizados com sucesso.' });
        } catch (error) {
            console.error('Erro ao atualizar dados do usuário logado (PATCH):', error);
            res.status(500).json({ error: 'Erro ao atualizar dados do usuário logado.' });
        }
    });


    // Listar usuários
    router.get('/', async (req, res) => {
        try {
            const [results] = await pool.query('SELECT id, name, email, foto_perfil FROM users');
            
            // Mapeia os resultados para adicionar a URL completa da imagem
            const usersWithUrls = results.map(addFullImageUrlsToUser);
            
            res.json(usersWithUrls);
        } catch (err) {
            console.error('Erro ao listar usuários:', err);
            res.status(500).json({ error: 'Erro ao listar usuários' });
        }
    });

    // --- AJUSTE A ROTA /me ---
    router.get('/me', authenticateToken, async (req, res) => {
        try {
            const userId = req.user.id;
            // CORREÇÃO: Buscamos o resultado primeiro, depois checamos
            const [results] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
            
            if (results.length === 0) {
                return res.status(404).json({ message: 'Usuário não encontrado.' });
            }

            const user = results[0];

            // Usamos a função auxiliar para adicionar a URL da imagem
            const userWithUrl = addFullImageUrlsToUser(user);
            
            // Remove a senha antes de enviar a resposta
            delete userWithUrl.password; 

            res.json(userWithUrl);
        } catch (error) {
            // CORREÇÃO: Adicionamos o tratamento de erro que estava faltando
            console.error('Erro ao buscar dados do usuário logado:', error);
            res.status(500).json({ error: 'Erro ao buscar dados do usuário.' });
        }
    });

    // Deletar usuário
    router.delete('/:id', async (req, res) => {
        const userId = req.params.id;

        try {
            const [result] = await pool.query('DELETE FROM users WHERE id = ?', [userId]);
            if (result.affectedRows === 0) {
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
            const [results] = await pool.query(
                'SELECT * FROM users WHERE email = ? OR cpf = ?',
                [access, access]
            );
            console.log('Login - Resultados da consulta:', results);

            if (results.length === 0) {
                console.log('Login - Usuário não encontrado');
                return res.status(404).json({ error: 'Usuário não encontrado' });
            }

            const user = results[0];
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
                nome: user.name // Assumindo que o campo é 'name' no DB
            });
        } catch (error) {
            console.error('Erro ao realizar login:', error);
            res.status(500).json({ error: 'Erro ao realizar login' });
        }
    });
    
    // Atualizar dados e foto de perfil do usuário logado (PUT)
    // ESTA É A ROTA QUE SEU APLICATIVO FLUTTER ESTÁ USANDO PARA UPLOAD DE IMAGEM!
    router.put('/me', authenticateToken, upload.single('foto_perfil'), async (req, res) => {
        const userId = req.user.id;
        const { name, email, telefone, sexo, data_nascimento, cpf, endereco, numero, bairro, cidade, estado, complemento, password } = req.body;
        const foto_perfil = req.file ? req.file.filename : null; // Acessa o nome do arquivo via req.file

        console.log("PUT /me - Dados recebidos (req.body):", req.body);
        console.log("PUT /me - Arquivo de foto recebido (req.file):", req.file);

        try {
            const updates = [];
            const params = [];

            if (name) { updates.push('name = ?'); params.push(name); }
            if (email) { updates.push('email = ?'); params.push(email); }
            if (telefone) { updates.push('telefone = ?'); params.push(telefone); }
            if (sexo) { updates.push('sexo = ?'); params.push(sexo); }
            if (data_nascimento) { updates.push('data_nascimento = ?'); params.push(data_nascimento); }
            if (cpf) { updates.push('cpf = ?'); params.push(cpf); }
            if (endereco) { updates.push('endereco = ?'); params.push(endereco); }
            if (numero) { updates.push('numero = ?'); params.push(numero); }
            if (bairro) { updates.push('bairro = ?'); params.push(bairro); }
            if (cidade) { updates.push('cidade = ?'); params.push(cidade); }
            if (estado) { updates.push('estado = ?'); params.push(estado); }
            if (complemento) { updates.push('complemento = ?'); params.push(complemento); }
            
            if (foto_perfil) { 
                updates.push('foto_perfil = ?'); 
                params.push(foto_perfil);
                console.log("PUT /me - Nome do arquivo de perfil a ser salvo no DB (Multer):", foto_perfil);
            }

            // Atualiza a senha se fornecida
            if (password) {
                const hashedPassword = await bcrypt.hash(password, 10);
                updates.push('password = ?');
                params.push(hashedPassword);
            }

            if (updates.length === 0) {
                return res.status(400).json({ message: 'Nenhum dado a ser atualizado.' });
            }

            params.push(userId);

            const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
            console.log("PUT /me - Query SQL executada:", query);
            console.log("PUT /me - Parâmetros SQL:", params);

            const [result] = await pool.query(query, params);
            
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Usuário não encontrado.' });
            }

            // Adicionado: Busca os dados atualizados do usuário para retornar uma resposta completa.
            const [updatedUserResults] = await pool.query(`
                SELECT id, name, email, foto_perfil, telefone, sexo, data_nascimento, 
                cpf, endereco, numero, bairro, cidade, estado, complemento 
                FROM users 
                WHERE id = ?
            `, [userId]);

            if (updatedUserResults.length === 0) {
                return res.status(500).json({ error: 'Erro ao buscar usuário atualizado após o update.' });
            }
            const { password: _, ...updatedUser } = updatedUserResults[0]; // Remove a senha antes de enviar

            res.json({ message: 'Dados e foto de perfil do usuário logado atualizados com sucesso.', user: updatedUser });

        } catch (error) {
            console.error('ERRO CRÍTICO ao atualizar dados do usuário logado (PUT /me):', error);
            // Melhora a mensagem de erro para o cliente em caso de erro de Multer
            if (error.code === 'LIMIT_FILE_SIZE') {
                res.status(400).json({ error: 'O arquivo de foto é muito grande. Tamanho máximo permitido é 20MB.' });
            } else {
                res.status(500).json({ error: 'Erro interno do servidor ao atualizar perfil.' });
            }
        }
    });


    // Atualizar dados e foto de perfil de um usuário específico (PUT) - Geralmente para admin
    router.put('/:id', authenticateToken, upload.single('foto_perfil'), async (req, res) => { // Adicionado authenticateToken aqui também
        const userId = req.params.id; // ID do usuário a ser atualizado
        const { name, email, telefone, sexo, data_nascimento, cpf, endereco, numero, bairro, cidade, estado, complemento, password } = req.body;
        const foto_perfil = req.file ? req.file.filename : null;

        console.log("PUT /:id - Dados recebidos:", req.body);
        console.log("PUT /:id - Arquivo recebido (req.file):", req.file);

        try {
            // Verifica se o usuário logado tem permissão (ex: é admin) para atualizar outros usuários
            // if (req.user.role !== 'admin' && req.user.id !== userId) { // Exemplo de verificação de permissão
            //     return res.status(403).json({ message: 'Acesso negado. Você só pode atualizar seu próprio perfil.' });
            // }

            const updates = [];
            const params = [];

            if (name) { updates.push('name = ?'); params.push(name); }
            if (email) { updates.push('email = ?'); params.push(email); }
            if (telefone) { updates.push('telefone = ?'); params.push(telefone); }
            if (sexo) { updates.push('sexo = ?'); params.push(sexo); }
            if (data_nascimento) { updates.push('data_nascimento = ?'); params.push(data_nascimento); }
            if (cpf) { updates.push('cpf = ?'); params.push(cpf); }
            if (endereco) { updates.push('endereco = ?'); params.push(endereco); }
            if (numero) { updates.push('numero = ?'); params.push(numero); }
            if (bairro) { updates.push('bairro = ?'); params.push(bairro); }
            if (cidade) { updates.push('cidade = ?'); params.push(cidade); }
            if (estado) { updates.push('estado = ?'); params.push(estado); }
            if (complemento) { updates.push('complemento = ?'); params.push(complemento); }
            
            if (foto_perfil) { 
                updates.push('foto_perfil = ?'); 
                params.push(foto_perfil);
                console.log("PUT /:id - Nome do arquivo de perfil a ser salvo no DB (Multer):", foto_perfil);
            }

            // Atualiza a senha se fornecida
            if (password) {
                const hashedPassword = await bcrypt.hash(password, 10);
                updates.push('password = ?');
                params.push(hashedPassword);
            }

            if (updates.length === 0) {
                return res.status(400).json({ message: 'Nenhum dado a ser atualizado.' });
            }

            params.push(userId);

            const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
            console.log("PUT /:id - Query SQL executada:", query);
            console.log("PUT /:id - Parâmetros SQL:", params);

            const [result] = await pool.query(query, params);

            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Usuário não encontrado.' });
            }

            res.json({ message: 'Dados e foto de perfil do usuário atualizados com sucesso.' });
        } catch (error) {
            console.error('ERRO CRÍTICO ao atualizar dados do usuário (PUT /:id):', error);
            if (error.code === 'LIMIT_FILE_SIZE') {
                res.status(400).json({ error: 'O arquivo de foto é muito grande. Tamanho máximo permitido é 20MB.' });
            } else {
                res.status(500).json({ error: 'Erro interno do servidor ao atualizar usuário.' });
            }
        }
    });



    /**
 * @route   GET /api/users/:id/reservas
 * @desc    Busca todas as reservas criadas por um usuário específico
 * @access  Private (Admin ou o próprio usuário)
 */
router.get('/:id/reservas', authenticateToken, async (req, res) => {
    const userIdToFetch = req.params.id;
    const loggedInUser = req.user; // Dados do usuário logado, vindo do token JWT

    // Verificação de segurança: O usuário logado só pode ver suas próprias reservas,
    // a menos que ele seja um 'admin' ou 'gerente'.
    if (loggedInUser.role !== 'admin' && loggedInUser.role !== 'gerente' && loggedInUser.id.toString() !== userIdToFetch) {
        return res.status(403).json({ message: 'Acesso negado. Você não tem permissão para ver as reservas deste usuário.' });
    }

    try {
        // Query avançada: Busca as reservas e, ao mesmo tempo, conta quantos convidados cada uma tem.
        const sql = `
            SELECT 
                r.*,
                (SELECT COUNT(*) FROM convidados c WHERE c.reserva_id = r.id) as quantidade_convidados,
                (SELECT COUNT(*) FROM convidados c WHERE c.reserva_id = r.id AND c.status = 'CHECK-IN') as quantidade_checkins
            FROM 
                reservas r
            WHERE 
                r.user_id = ?
            ORDER BY 
                r.data_reserva DESC;
        `;

        const [reservas] = await pool.query(sql, [userIdToFetch]);

        if (reservas.length === 0) {
            return res.status(200).json([]); // Retorna um array vazio se o usuário não tiver reservas
        }

        res.status(200).json(reservas);

    } catch (error) {
        console.error(`Erro ao buscar reservas para o usuário ${userIdToFetch}:`, error);
        res.status(500).json({ error: 'Erro ao buscar as reservas do usuário.' });
    }
});



    return router;
};
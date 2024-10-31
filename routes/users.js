const express = require('express');
const bcryptjs = require('bcryptjs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require("multer");
const path = require("path");
const authenticateToken = require('../middleware/auth');

const rootPath = path.resolve(__dirname, '..');
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, path.join(rootPath, 'uploads')),
        filename: (req, file, cb) => {
            const timestamp = Date.now();
            const ext = path.extname(file.originalname);
            const filename = `${timestamp}${ext}`; // Nomeia o arquivo como "timestamp.extensão"
            cb(null, filename);
        },
    }),
    limits: { fileSize: 20 * 1024 * 1024 },
});



const router = express.Router();
const IMAGE_DIRECTORY = path.join(__dirname, 'uploads');

module.exports = (pool) => {
    
    // Cadastro de usuário
    router.post('/', async (req, res) => {
        const { name, email, password, profileImageUrl } = req.body;

        try {
            const hashedPassword = await bcryptjs.hash(password, 10);
            const [result] = await pool.promise().query(
                'INSERT INTO users (name, email, password, foto_perfil) VALUES (?, ?, ?, ?)',
                [name, email, hashedPassword, profileImageUrl]
            );
            res.status(201).json({ id: result.insertId, name, email, profileImageUrl });
        } catch (error) {
            console.error('Erro ao cadastrar usuário:', error);
            res.status(500).json({ error: 'Erro ao cadastrar usuário' });
        }
    });

    
    // Atualizar dados do usuário logado (PATCH)
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
    
            // Se houver imagem em Base64, faça o upload e armazene o nome
            if (foto_perfil) {
                const base64Data = foto_perfil.replace(/^data:image\/\w+;base64,/, "");
                const buffer = Buffer.from(base64Data, 'base64');
                const filename = `${Date.now()}.jpg`; // Nomeia o arquivo com o timestamp em milissegundos
    
                fs.writeFileSync(path.join(IMAGE_DIRECTORY, filename), buffer);
                updates.push('foto_perfil = ?');
                params.push(filename); // Armazena apenas o nome do arquivo
            }
    
            params.push(userId);
    
            if (updates.length === 0) {
                return res.status(400).json({ message: 'Nenhum dado a ser atualizado.' });
            }
    
            const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
            const [result] = await pool.promise().query(query, params);
    
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Usuário não encontrado.' });
            }
    
            res.json({ message: 'Dados do usuário logado atualizados com sucesso.' });
        } catch (error) {
            console.error('Erro ao atualizar dados do usuário logado:', error);
            res.status(500).json({ error: 'Erro ao atualizar dados do usuário logado.' });
        }
    });


    // Listar usuários
    router.get('/', async (req, res) => {
        try {
            const [results] = await pool.promise().query(`
                SELECT id, name, email, foto_perfil, telefone, sexo, data_nascimento, 
                cpf, endereco, numero, bairro, cidade, estado, complemento 
                FROM users
            `);
            const sanitizedResults = results.map(({ password, ...user }) => user);
            res.json(sanitizedResults);
        } catch (err) {
            console.error('Erro ao listar usuários:', err);
            res.status(500).json({ error: 'Erro ao listar usuários' });
        }
    });

    // Obter dados do usuário logado
    router.get('/me', authenticateToken, async (req, res) => {
        try {
            const userId = req.user.id;
            const [results] = await pool.promise().query(`
                SELECT id, name, email, foto_perfil, telefone, sexo, data_nascimento, 
                cpf, endereco, numero, bairro, cidade, estado, complemento 
                FROM users 
                WHERE id = ?
            `, [userId]);
            if (results.length === 0) return res.sendStatus(404);
            const { password, ...user } = results[0];
            res.json(user);
        } catch (error) {
            console.error('Erro ao buscar dados do usuário:', error);
            res.status(500).json({ error: 'Erro ao buscar dados do usuário' });
        }
    });




   



    // Deletar usuário
    router.delete('/:id', async (req, res) => {
        const userId = req.params.id;

        try {
            const [result] = await pool.promise().query('DELETE FROM users WHERE id = ?', [userId]);
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
        console.log('Acesso:', access);
        console.log('Password:', password);
    
        try {
            const [results] = await pool.promise().query(
                'SELECT * FROM users WHERE email = ? OR cpf = ?',
                [access, access]
            );
            console.log('Resultados da consulta:', results);
    
            if (results.length === 0) {
                console.log('Usuário não encontrado');
                return res.status(404).json({ error: 'Usuário não encontrado' });
            }
    
            const user = results[0];
            const isPasswordValid = await bcryptjs.compare(password, user.password);
            console.log('Senha válida:', isPasswordValid);
    
            if (!isPasswordValid) {
                return res.status(401).json({ error: 'Credenciais inválidas' });
            }
    
            const token = jwt.sign(
                { id: user.id, email: user.email },
                process.env.JWT_SECRET || 'chave_secreta',
                { expiresIn: '1h' }
            );
    
            res.json({ token });
        } catch (error) {
            console.error('Erro ao realizar login:', error);
            res.status(500).json({ error: 'Erro ao realizar login' });
        }
    });
    
    









// Atualizar dados e foto de perfil do usuário logado (PUT)
router.put('/me', authenticateToken, upload.single('foto_perfil'), async (req, res) => {
    const userId = req.user.id;
    const { name, email, telefone, sexo, data_nascimento, cpf, endereco, numero, bairro, cidade, estado, complemento, password } = req.body;
    const foto_perfil = req.file ? req.file.filename : null;

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
        if (foto_perfil) { updates.push('foto_perfil = ?'); params.push(foto_perfil); }

        // Atualiza a senha se fornecida
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            updates.push('password = ?');
            params.push(hashedPassword);
        }

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
        await pool.promise().query(query, params);

        res.json({ message: 'Dados e foto de perfil do usuário logado atualizados com sucesso.' });
    } catch (error) {
        console.error('Erro ao atualizar dados do usuário logado:', error);
        res.status(500).json({ error: 'Erro ao atualizar dados do usuário logado.' });
    }
});


// Atualizar dados e foto de perfil de um usuário específico (PUT)
router.put('/:id', upload.single('foto_perfil'), async (req, res) => {
    const userId = req.params.id;
    const { name, email, telefone, sexo, data_nascimento, cpf, endereco, numero, bairro, cidade, estado, complemento, password } = req.body;
    const foto_perfil = req.file ? req.file.filename : null;

    console.log("Dados recebidos:", req.body); // Log dos dados recebidos

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
        if (foto_perfil) { updates.push('foto_perfil = ?'); params.push(foto_perfil); }

        // Atualiza a senha se fornecida
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            updates.push('password = ?');
            params.push(hashedPassword);
        }

        if (updates.length === 0) {
            return res.status(400).json({ message: 'Nenhum dado a ser atualizado.' });
        }

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            updates.push('password = ?');
            params.push(hashedPassword);
        }

        params.push(userId);

        const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
        const [result] = await pool.promise().query(query, params);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        res.json({ message: 'Dados e foto de perfil do usuário atualizados com sucesso.' });
    } catch (error) {
        console.error('Erro ao atualizar dados do usuário:', error);
        res.status(500).json({ error: 'Erro ao atualizar dados do usuário.' });
    }
});












    return router;
};

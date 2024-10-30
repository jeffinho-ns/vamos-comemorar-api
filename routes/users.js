const express = require('express');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const authenticateToken = require(path.join(__dirname, '..', 'middleware', 'auth'));

// Caminho absoluto para o diretório raiz
const rootPath = path.resolve(__dirname, '..');

// Configuração do Multer para upload de imagem de perfil
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, path.join(rootPath, 'uploads')),
        filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
    }),
    limits: { fileSize: 20 * 1024 * 1024 }, // Limite de 20 MB
});

const router = express.Router();

module.exports = (pool) => {
    // Endpoint para cadastrar usuário
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

    // Endpoint para listar usuários
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

    // Endpoint para obter dados do usuário logado
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

    // Endpoint para atualizar apenas a foto de perfil
    router.put('/me/foto', authenticateToken, upload.single('foto_perfil'), async (req, res) => {
        const userId = req.user.id;
        const foto_perfil = req.file ? req.file.filename : null;

        if (!foto_perfil) {
            return res.status(400).json({ error: 'Nenhuma foto enviada.' });
        }

        try {
            const query = 'UPDATE users SET foto_perfil = ? WHERE id = ?';
            const [result] = await pool.promise().query(query, [foto_perfil, userId]);

            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Usuário não encontrado.' });
            }

            res.json({ message: 'Foto de perfil atualizada com sucesso.', foto_perfil });
        } catch (error) {
            console.error('Erro ao atualizar foto de perfil:', error);
            res.status(500).json({ error: 'Erro ao atualizar foto de perfil.' });
        }
    });

    // Endpoint para atualizar dados do usuário logado
    router.patch('/me', authenticateToken, async (req, res) => {
        const userId = req.user.id;
        const { name, email, password, foto_perfil } = req.body;

        let updates = [];
        const params = [];

        if (name) {
            updates.push('name = ?');
            params.push(name);
        }
        if (email) {
            updates.push('email = ?');
            params.push(email);
        }
        if (password) {
            try {
                const hashedPassword = await bcryptjs.hash(password, 10);
                updates.push('password = ?');
                params.push(hashedPassword);
            } catch (error) {
                return res.status(500).json({ error: 'Erro ao processar senha' });
            }
        }
        if (foto_perfil) {
            updates.push('foto_perfil = ?');
            params.push(foto_perfil);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Nenhum campo para atualizar.' });
        }

        const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
        params.push(userId);

        try {
            const [result] = await pool.promise().query(query, params);
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Usuário não encontrado.' });
            }
            const [updatedUser] = await pool.promise().query(`SELECT * FROM users WHERE id = ?`, [userId]);
            const { password, ...userData } = updatedUser[0];
            res.json({ message: 'Dados do usuário atualizados com sucesso.', user: userData });
        } catch (error) {
            console.error('Erro ao atualizar dados do usuário:', error);
            res.status(500).json({ error: 'Erro ao atualizar dados do usuário.' });
        }
    });

    // Endpoint para atualizar usuário com imagem de perfil
    router.put('/:id', authenticateToken, upload.single('image'), async (req, res) => {
        const { id } = req.params;
        const { name, email, telefone, sexo, cep, cpf, endereco, numero, bairro, cidade, estado, complemento, password } = req.body;
        const foto_perfil = req.file ? req.file.filename : null;

        let updates = [];
        const params = [];

        if (name) updates.push('name = ?'), params.push(name);
        if (email) updates.push('email = ?'), params.push(email);
        if (telefone) updates.push('telefone = ?'), params.push(telefone);
        if (sexo) updates.push('sexo = ?'), params.push(sexo);
        if (cep) updates.push('cep = ?'), params.push(cep);
        if (cpf) updates.push('cpf = ?'), params.push(cpf);
        if (endereco) updates.push('endereco = ?'), params.push(endereco);
        if (numero) updates.push('numero = ?'), params.push(numero);
        if (bairro) updates.push('bairro = ?'), params.push(bairro);
        if (cidade) updates.push('cidade = ?'), params.push(cidade);
        if (estado) updates.push('estado = ?'), params.push(estado);
        if (complemento) updates.push('complemento = ?'), params.push(complemento);
        if (foto_perfil) updates.push('foto_perfil = ?'), params.push(foto_perfil);
        if (password) {
            try {
                const hashedPassword = await bcryptjs.hash(password, 10);
                updates.push('password = ?'), params.push(hashedPassword);
            } catch (error) {
                return res.status(500).json({ error: 'Erro ao processar senha' });
            }
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Nenhum campo para atualizar.' });
        }

        const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
        params.push(id);

        try {
            const [result] = await pool.promise().query(query, params);
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Usuário não encontrado.' });
            }
            res.json({ message: 'Usuário atualizado com sucesso.' });
        } catch (error) {
            console.error('Erro ao atualizar usuário:', error);
            res.status(500).json({ error: 'Erro ao atualizar usuário.' });
        }
    });

    // Endpoint de login
    router.post('/login', async (req, res) => {
        const { access, password } = req.body;
    
        try {
            const [results] = await pool.promise().query(
                'SELECT * FROM users WHERE email = ? OR cpf = ?',
                [access, access]
            );
    
            if (results.length === 0) {
                return res.status(404).json({ error: 'Usuário não encontrado' });
            }
    
            const user = results[0];
            const isPasswordValid = await bcryptjs.compare(password, user.password);
    
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
    
    return router;
};

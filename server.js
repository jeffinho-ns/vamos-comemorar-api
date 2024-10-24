const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const router = express.Router();
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: '*',
    credentials: true,
}));
app.use(express.json({ limit: '100mb' }));
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '100mb' }));

// Diretório de uploads
const uploadDir = path.join(__dirname, 'uploads'); // Define o caminho correto para a pasta de uploads

const upload = multer({
    storage: multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, uploadDir); // Define o diretório de destino dos uploads
      },
      filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname)); // Nomeia o arquivo com data atual + extensão original
      },
    }),
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
        if (!allowedTypes.includes(file.mimetype)) {
            const error = new Error('Tipo de arquivo não suportado');
            error.code = 'LIMIT_FILE_TYPES';
            return cb(error, false);
        }
        cb(null, true);
    },
    limits: { fileSize: 10000000 }, // Limite de 10MB
});

// Verifica se a pasta de upload existe, se não, cria
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Serve o diretório de uploads como arquivos estáticos
app.use('/uploads', express.static(uploadDir));

// Rota de upload
app.post('/api/uploads', upload.single('image'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }
    // Corrigido o caminho da URL para não duplicar "/uploads"
    const imageUrl = `${req.file.filename}`;
    res.json({ imageUrl });
});

// Criação do pool de conexões
const pool = mysql.createPool({
    host: '193.203.175.55',
    user: 'u621081794_vamos',
    password: '@123Mudar!@',
    database: 'u621081794_vamos',
});

// Middleware para autenticação do token
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];

    if (!token) {
        return res.sendStatus(401);
    }

    jwt.verify(token, 'SEU_SEGREDO', (err, user) => {
        if (err) {
            return res.sendStatus(403);
        }
        req.user = user;
        next();
    });
};

// Endpoint para cadastrar usuários com a URL da imagem de perfil
app.post('/api/users', async (req, res) => {
    const { name, email, password, profileImageUrl } = req.body;

    try {
        // Hash da senha
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insere os dados do usuário no banco de dados, incluindo a URL da imagem
        const [result] = await pool.promise().query(
            'INSERT INTO users (name, email, password, foto_perfil) VALUES (?, ?, ?, ?)', 
            [name, email, hashedPassword, profileImageUrl]
        );
        
        res.status(201).json({ id: result.insertId, name, email, profileImageUrl });
    } catch (error) {
        console.error('Erro ao cadastrar usuário:', error);
        return res.status(500).json({ error: 'Erro ao cadastrar usuário' });
    }
});


// Endpoint para listar usuários
app.get('/api/users', async (req, res) => {
    try {
        const [results] = await pool.promise().query(`
            SELECT 
                id, name, email, foto_perfil, telefone, sexo, data_nascimento, 
                cpf, endereco, numero, bairro, cidade, estado, complemento 
            FROM users
        `);
        
        // Remove a senha de cada usuário
        const sanitizedResults = results.map(({ password, ...user }) => user);
        
        res.json(sanitizedResults);
    } catch (err) {
        console.error('Erro ao listar usuários:', err);
        return res.status(500).json(err);
    }
});

// Endpoint para obter dados do usuário logado

app.get('/api/users/me', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id; // Captura o ID do usuário do token
        const [results] = await pool.promise().query(`
            SELECT 
                id, name, email, foto_perfil, telefone, sexo, data_nascimento, 
                cpf, endereco, numero, bairro, cidade, estado, complemento 
            FROM users 
            WHERE id = ?`, 
            [userId]
        );

        if (results.length === 0) {
            return res.sendStatus(404); // Usuário não encontrado
        }

        const { password, ...user } = results[0]; // Remove a senha
        res.json(user); // Retorna os dados do usuário
    } catch (error) {
        console.error('Erro ao buscar dados do usuário:', error);
        return res.status(500).json({ error: 'Erro ao buscar dados do usuário' });
    }
});



// Endpoint para atualizar os dados do usuário logado
app.patch('/api/users/me', authenticateToken, async (req, res) => {
    const userId = req.user.id; // Captura o ID do usuário do token
    const { name, email, password, foto_perfil } = req.body;

    let updates = [];
    let query = 'UPDATE users SET';

    if (name) {
        updates.push(` name = ?`);
    }
    if (email) {
        updates.push(` email = ?`);
    }
    if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        updates.push(` password = ?`);
        updates.push(hashedPassword);
    }
    if (foto_perfil) {
        updates.push(` foto_perfil = ?`);
    }

    if (updates.length === 0) {
        return res.status(400).json({ error: 'Nenhum campo para atualizar.' });
    }

    query += updates.join(',') + ' WHERE id = ?';
    updates.push(userId);

    try {
        const [result] = await pool.promise().query(query, updates);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        res.json({ message: 'Dados do usuário atualizados com sucesso.' });
    } catch (error) {
        console.error('Erro ao atualizar dados do usuário:', error);
        return res.status(500).json({ error: 'Erro ao atualizar dados do usuário.' });
    }
});




// Endpoint para atualizar usuários com imagem de perfil
app.put('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const { foto_perfil, name, email, telefone, sexo, cep, cpf, endereco, numero, bairro, cidade, estado, complemento, password } = req.body;

    let query = `UPDATE users SET foto_perfil = ?, name = ?, email = ?, telefone = ?, sexo = ?, cep = ?, cpf = ?, endereco = ?, numero = ?, bairro = ?, cidade = ?, estado = ?, complemento = ?, password = ?`;
    const updates = [foto_perfil, name, email, telefone, sexo, cep, cpf, endereco, numero, bairro, cidade, estado, complemento, password];

    try {
        // Se a senha foi fornecida, faz o hash e adiciona ao conjunto de atualizações
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            query += `, password = ?`;
            updates.push(hashedPassword);
        }

        query += ` WHERE id = ?`;
        updates.push(id);

        const [result] = await pool.promise().query(query, updates);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        res.json({ id, name, email });
    } catch (error) {
        console.error('Erro ao atualizar usuário:', error);
        return res.status(500).json({ error: 'Erro ao atualizar usuário.' });
    }
});

// Endpoint de login
app.post('/api/users/login', async (req, res) => {
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

        // Comparar a senha usando bcrypt
        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {
            // Se a senha estiver correta, gera um token JWT
            const token = jwt.sign({ id: user.id, email: user.email }, 'SEU_SEGREDO', { expiresIn: '1h' });
            res.status(200).json({ message: 'Login bem-sucedido', user, token });
        } else {
            res.status(401).json({ error: 'Senha incorreta.' });
        }
    } catch (error) {
        console.error('Erro ao buscar usuário:', error);
        return res.status(500).json({ error: 'Erro ao buscar usuário' });
    }
});

// Iniciar o servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = router;

const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const multer = require('multer'); // Importa o multer
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;


// Middleware
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true,
}));
app.use(express.json({ limit: '100mb' }));
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '100mb' }));

// Diretório de uploads
const uploadDir = path.join(__dirname, 'uploads');

// Verifica se a pasta de upload existe, se não, cria
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuração do multer
const storage = multer.memoryStorage(); // Armazena os arquivos na memória
const upload = multer({ 
    storage: storage, 
    limits: { fileSize: 100 * 1024 * 1024 } // Limite de 100 MB
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
    const token = req.headers['authorization']?.split(' ')[1]; // Captura o token do cabeçalho

    if (!token) {
        return res.sendStatus(401); // Não autorizado
    }

    jwt.verify(token, 'SEU_SEGREDO', (err, user) => {
        if (err) {
            return res.sendStatus(403); // Proibido
        }
        req.user = user; // Anexa o usuário decodificado à requisição
        next(); // Chama o próximo middleware
    });
};

// Endpoint para upload de imagem e retornar a URL da imagem
app.post('/api/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send('Nenhuma imagem foi enviada.');
        }

        const outputPath = path.join(uploadDir, `profile_${Date.now()}.jpg`);

        // Redimensiona a imagem usando sharp e salva no diretório de uploads
        await sharp(req.file.buffer)
            .resize(300, 300)
            .toFormat('jpeg')
            .jpeg({ quality: 80 })
            .toFile(outputPath);

        const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${path.basename(outputPath)}`;
        res.status(200).json({ message: 'Imagem enviada com sucesso', imageUrl });
    } catch (err) {
        console.error('Erro ao processar a imagem:', err);
        return res.status(500).json({ error: 'Erro ao processar a imagem' });
    }
});

// Serve o diretório de uploads como arquivos estáticos
app.use('/uploads', express.static(uploadDir));

// Endpoint para cadastrar usuários com a URL da imagem de perfil
app.post('/api/users', async (req, res) => {
    const { name, email, password, profileImageUrl } = req.body;

    try {
        // Hash da senha
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insere os dados do usuário no banco de dados
        const [result] = await pool.promise().query('INSERT INTO users (name, email, password, foto_perfil) VALUES (?, ?, ?, ?)', [name, email, hashedPassword, profileImageUrl]);
        
        res.status(201).json({ id: result.insertId, name, email, profileImageUrl });
    } catch (error) {
        console.error('Erro ao cadastrar usuário:', error);
        return res.status(500).json({ error: 'Erro ao cadastrar usuário' });
    }
});

// Endpoint para listar usuários
app.get('/api/users', async (req, res) => {
    try {
        const [results] = await pool.promise().query('SELECT * FROM users');
        res.json(results);
    } catch (err) {
        console.error('Erro ao listar usuários:', err);
        return res.status(500).json(err);
    }
});


// Endpoint para obter dados do usuário logado
app.get('/api/users/me', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id; // Captura o ID do usuário do token
        const [results] = await pool.promise().query('SELECT * FROM users WHERE id = ?', [userId]);

        if (results.length === 0) {
            return res.sendStatus(404); // Usuário não encontrado
        }

        const user = results[0];
        res.json(user); // Retorna os dados do usuário
    } catch (error) {
        console.error('Erro ao buscar dados do usuário:', error);
        return res.status(500).json({ error: 'Erro ao buscar dados do usuário' });
    }
});


// Endpoint para atualizar usuários com imagem de perfil
app.put('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const {
        foto_perfil,
        name,
        email,
        telefone,
        sexo,
        data_nascimento,
        cep,
        cpf,
        endereco,
        numero,
        bairro,
        cidade,
        estado,
        complemento,
        password
    } = req.body;

    // Lista de campos que serão atualizados
    const updates = [
        foto_perfil,
        name,
        email,
        telefone,
        sexo,
        data_nascimento,
        cep,
        cpf,
        endereco,
        numero,
        bairro,
        cidade,
        estado,
        complemento
    ];

    let query = `
        UPDATE users SET
            foto_perfil = ?, 
            name = ?, 
            email = ?, 
            telefone = ?, 
            sexo = ?, 
            data_nascimento = ?, 
            cep = ?, 
            cpf = ?,
            endereco = ?, 
            numero = ?, 
            bairro = ?, 
            cidade = ?, 
            estado = ?, 
            complemento = ?
    `;

    try {
        // Se a senha foi fornecida, faz o hash e adiciona ao conjunto de atualizações
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            query += `, password = ?`; // Adiciona a senha na query de atualização
            updates.push(hashedPassword); // Adiciona o hash da senha à lista de atualizações
        }

        query += ` WHERE id = ?`; // Finaliza a query
        updates.push(id); // Adiciona o ID do usuário no final para a cláusula WHERE

        // Executa a query no banco de dados
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
            console.log(`Usuário não encontrado: ${access}`);
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        const user = results[0];
        console.log(`Usuário encontrado: ${user.email || user.cpf}`);

        // Comparar a senha usando bcrypt
        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {
            // Se a senha estiver correta, gera um token JWT
            const token = jwt.sign({ id: user.id, email: user.email }, 'SEU_SEGREDO', { expiresIn: '1h' }); // Ajuste o tempo de expiração conforme necessário
            res.status(200).json({ message: 'Login bem-sucedido', user, token });
        } else {
            console.log('Senha incorreta fornecida.');
            res.status(401).json({ error: 'Senha incorreta.' });
        }
    } catch (error) {
        console.error('Erro ao buscar usuário:', error);
        return res.status(500).json({ error: 'Erro ao buscar usuário' });
    }
});

// Iniciar o servidor
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

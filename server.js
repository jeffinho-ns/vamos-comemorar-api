// Importando dotenv para carregar variáveis de ambiente
require('dotenv').config();

const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const bcryptjs = require('bcryptjs');
const path = require('path');
const jwt = require('jsonwebtoken'); // Importando o jwt para uso posterior

const app = express();
const PORT = process.env.PORT || 5000; // Agora pode ser configurado no .env

// Middleware
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '100mb' }));

const upload = multer({
    dest: 'uploads/', // Pasta onde os arquivos serão armazenados
    limits: { fileSize: 50 * 1024 * 1024 }, // Limite de tamanho do arquivo (50 MB)
    fileFilter: (req, file, cb) => {
        // Verifica se o arquivo é do tipo desejado (ex: jpeg, png)
        const filetypes = /jpeg|jpg|png|gif/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb('Erro: Tipo de arquivo não suportado!');
    }
});

// Diretório de uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configuração para upload geral
const generalUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
    }),
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.mimetype)) {
            const error = new Error('Tipo de arquivo não suportado');
            error.code = 'LIMIT_FILE_TYPES';
            return cb(error, false);
        }
        cb(null, true);
    },
    limits: { fileSize: 10 * 1024 * 1024 }, // Limite de 10 MB
});




// Pool de conexões do MySQL
const pool = mysql.createPool({
    host: process.env.DB_HOST || '193.203.175.55', // Agora pode ser configurado no .env
    user: process.env.DB_USER || 'u621081794_vamos', // Agora pode ser configurado no .env
    password: process.env.DB_PASSWORD || '@123Mudar!@', // Agora pode ser configurado no .env
    database: process.env.DB_NAME || 'u621081794_vamos', // Agora pode ser configurado no .env
});

// Importando as rotas
const userRoutes = require('./routes/users')(pool, upload); // Passando o upload para as rotas
const placeRoutes = require('./routes/places')(pool, upload);

// Usando as rotas
app.use('/api/users', userRoutes);
app.use('/api/places', placeRoutes);

// Rota de autenticação para gerar o JWT
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    // Aqui você deve verificar o usuário e a senha no banco de dados
    // Supondo que a verificação foi feita e o usuário é válido:
    const user = { id: 1, username }; // Exemplo de usuário (substitua pela lógica real)

    // Gerando o token
    const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' }); // Usando JWT_SECRET

    res.json({ token });
});

// Iniciando o servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});

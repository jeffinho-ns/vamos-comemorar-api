const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer'); // Mantenha este import
const fs = require('fs');
const bcryptjs = require('bcryptjs');
const path = require('path');
const pool = require('./config/database'); 
require("dotenv").config();
require('./middleware/passport');
const passport = require('passport');
const cookieSession = require('cookie-session');


const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
const corsOptions = {
    origin: ['http://localhost:3000', 'https://vamos-comemorar-next.vercel.app', 'https://vamos-comemorar-mobile.vercel.app'],
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'],
};
 
app.use(cors(corsOptions));
app.use(express.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '100mb' }));

// --- REMOVA OU COMENTE TODA ESTA INSTÂNCIA 'upload' ---
// const upload = multer({
//     dest: 'uploads/', // Pasta onde os arquivos serão armazenados
//     limits: { fileSize: 50 * 1024 * 1024 }, // Limite de tamanho do arquivo (5 MB)
//     fileFilter: (req, file, cb) => {
//         const filetypes = /jpeg|jpg|png|gif/;
//         const mimetype = filetypes.test(file.mimetype);
//         const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
//         if (mimetype && extname) {
//             return cb(null, true);
//         }
//         cb('Erro: Tipo de arquivo não suportado!');
//     }
// });
// ----------------------------------------------------

// Diretório de uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

app.use('/uploads', express.static(uploadDir));

// Configuração para upload geral (ESTA É A INSTÂNCIA QUE SUAS ROTAS DE USUÁRIO USAM!)
const generalUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
    }),
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/gif',
            'image/webp',
            'image/heic', // Manter esses adicionados
            'image/heif', // Manter esses adicionados
            'image/bmp',
            'image/tiff'
        ];
        // console.error('Mimetype recebido (generalUpload):', file.mimetype); // Você pode ativar este log para ver
        if (!allowedTypes.includes(file.mimetype)) {
            const error = new Error(`Tipo de arquivo não suportado: ${file.mimetype}`);
            error.code = 'LIMIT_FILE_TYPES';
            return cb(error, false);
        }
        cb(null, true);
    },
    limits: { fileSize: 10 * 1024 * 1024 },
});

app.post('/api/uploads', generalUpload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ imageUrl });
});

// Configuração específica para o logo na rota PUT /api/places/:id
// Mantenha logoUpload se for usado apenas para 'places' e não conflitar.
const logoUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
    }),
    limits: { fileSize: 50 * 1024 * 1024 }, // Este tem um limite de 50MB
});


// Pool de conexões do MySQL
// const pool = mysql.createPool({
//     host: '193.203.175.55',
//     user: 'u621081794_vamos',
//     password: '@123Mudar!@',
//     database: 'u621081794_vamos',
// });

// Sessão (necessária pro passport)
app.use(
  cookieSession({
    name: 'session',
    keys: [process.env.COOKIE_KEY || 'default-key'],
    maxAge: 24 * 60 * 60 * 1000,
  })
);

app.use(passport.initialize());
app.use(passport.session());



const userRoutes = require('./routes/users')(pool, generalUpload);
const placeRoutes = require('./routes/places')(pool, generalUpload);
const eventsRoutes = require('./routes/events')(pool);
const reservasRoutes = require('./routes/reservas')(pool, generalUpload);
const qrcodeRoutes = require('./routes/qrcode');
const convidadosRoutes = require('./routes/convidados');
const rotasProtegidas = require('./routes/protegidas');
const protectedRoutes = require('./routes/protectedRoutes');
const authRoutes = require('./routes/auth'); // social login + login POST



// Usando as rotas
// Usar as rotas
app.use('/auth', authRoutes); // Login com Google
app.use('/api/users', userRoutes);
app.use('/api/places', placeRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/reservas', reservasRoutes);
app.use('/api/qrcode', qrcodeRoutes);
app.use('/api/convidados', convidadosRoutes);
app.use('/api/protegidas', rotasProtegidas);
app.use('/api/protected', protectedRoutes);

// Iniciando o servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});

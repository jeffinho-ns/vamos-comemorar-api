// server.js CORRIGIDO E SIMPLIFICADO

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs'); // fs não estava sendo usado aqui, mas mantendo a variável caso precise
const path = require('path');
const passport = require('passport'); // Necessário apenas para o inicialize
const http = require('http');
const { Server } = require("socket.io");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ['http://localhost:3000', 'https://vamos-comemorar-next.vercel.app', 'https://vamos-comemorar-mobile.vercel.app'],
        credentials: true
    }
});

app.set('socketio', io);

const pool = require('./config/database');
// ATENÇÃO: A linha require('./middleware/passport') foi removida pois o conteúdo
// daquele arquivo era na verdade uma rota, não uma configuração de estratégia.
// A estratégia do Google é usada dentro de `routes/auth.js`.

const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors()); // Simplificado, corsOptions não é mais necessário sem credentials de cookie
app.use(express.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '100mb' }));

// Configuração de Uploads e Diretório Estático
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));
const generalUpload = multer({ /* ... sua config de multer ... */ });


// --- REMOVIDO: Sessões não são necessárias para uma API stateless com JWT ---
// app.use(cookieSession(...));
// app.use(passport.initialize()); // Removido pois nossas rotas JWT não dependem dele
// app.use(passport.session());  // Causa principal do conflito


// Importando as Rotas
const authRoutes = require('./routes/auth'); // Esta rota ainda pode ter lógica de passport para login social web
const userRoutes = require('./routes/users')(pool, generalUpload);
const placeRoutes = require('./routes/places')(pool, generalUpload);
const eventsRoutes = require('./routes/events')(pool);
const qrcodeRoutes = require('./routes/qrcode');
const checkinRoutes = require('./routes/checkin')(pool);
const reservasRoutes = require('./routes/reservas')(pool); 
const inviteRoutes = require('./routes/invite')(pool);
const convidadosRoutes = require('./routes/convidados')(pool);
const rulesRoutes = require('./routes/rules')(pool);


// Usando as Rotas
app.use('/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/places', placeRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/reservas', reservasRoutes);
app.use('/api/qrcode', qrcodeRoutes);
app.use('/api/convidados', convidadosRoutes); 
app.use('/api/checkin', checkinRoutes);
app.use('/convite', inviteRoutes);
app.use('/api/events/:eventId/rules', rulesRoutes);


// Iniciar o servidor
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
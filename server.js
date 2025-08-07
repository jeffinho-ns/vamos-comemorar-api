// server.js CORRIGIDO E SIMPLIFICADO

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const passport = require('passport');
const http = require('http');
const { Server } = require("socket.io");
require("dotenv").config();

// Configuração baseada no ambiente
const isDevelopment = process.env.NODE_ENV !== 'production';
const config = require(isDevelopment ? './config/development' : './config/production');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: config.server.cors
});

app.set('socketio', io);

const pool = require('./config/database');

// Disponibilizar pool para as rotas
app.set('pool', pool);

const PORT = config.server.port;

// Middleware
app.use(cors(config.server.cors));
app.use(express.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '100mb' }));

// Configuração de Uploads e Diretório Estático
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));
const generalUpload = multer({ /* ... sua config de multer ... */ });


// Importando e Inicializando as Rotas com suas dependências
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users')(pool, generalUpload);
const placeRoutes = require('./routes/places')(pool, generalUpload);

// ---- MODIFICAÇÃO AQUI: Importa router E a função checkAndAwardBrindes ----
const { router: reservasRouter, checkAndAwardBrindes } = require('./routes/reservas')(pool);
// ---- MODIFICAÇÃO AQUI: Passa checkAndAwardBrindes para eventsRoutes ----
const eventsRoutes = require('./routes/events')(pool, checkAndAwardBrindes); 

const qrcodeRoutes = require('./routes/qrcode');
const checkinRoutes = require('./routes/checkin')(pool);
const inviteRoutes = require('./routes/invite')(pool);
const convidadosRoutes = require('./routes/convidados')(pool);
const rulesRoutes = require('./routes/rules')(pool);
const birthdayReservationsRouter = require('./routes/birthdayReservations')(pool);
const imagesRouter = require('./routes/images');


// Usando as Rotas
app.use('/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/places', placeRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/reservas', reservasRouter); // Usa o router destruturado
app.use('/api/qrcode', qrcodeRoutes);
app.use('/api/convidados', convidadosRoutes);
app.use('/api/checkin', checkinRoutes);
app.use('/convite', inviteRoutes);
app.use('/api/events/:eventId/rules', rulesRoutes);
app.use('/api/birthday-reservations', birthdayReservationsRouter);
app.use('/api/images', imagesRouter);


// Iniciar o servidor
server.listen(PORT, config.server.host, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`🌐 CORS origins: ${config.server.cors.origin.join(', ')}`);
});
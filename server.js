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

const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
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
const birthdayReservationsRoutes = require('./routes/birthday-reservations')(pool);


// Usando as Rotas
app.use('/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/places', placeRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/reservas', reservasRouter); // Usa o router destruturado
app.use('/api/birthday-reservations', birthdayReservationsRoutes);
app.use('/api/qrcode', qrcodeRoutes);
app.use('/api/convidados', convidadosRoutes);
app.use('/api/checkin', checkinRoutes);
app.use('/convite', inviteRoutes);
app.use('/api/events/:eventId/rules', rulesRoutes);


// Iniciar o servidor
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
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
app.set('ftpConfig', config.ftp);

const PORT = config.server.port;

// Middleware
app.use(cors(config.server.cors));
app.use(express.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '100mb' }));

// Middleware para logs de requisições
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Configuração de Uploads e Diretório Estático
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));
const generalUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const timestamp = Date.now();
      const ext = path.extname(file.originalname);
      const filename = `${timestamp}${ext}`;
      cb(null, filename);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});


// Importando e Inicializando as Rotas com suas dependências
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users')(pool, generalUpload);
const placeRoutes = require('./routes/places')(pool, generalUpload);

const { router: reservasRouter, checkAndAwardBrindes } = require('./routes/reservas')(pool);
const eventsRoutes = require('./routes/events')(pool, checkAndAwardBrindes); 

const qrcodeRoutes = require('./routes/qrcode');
const checkinRoutes = require('./routes/checkin')(pool);
const inviteRoutes = require('./routes/invite')(pool);
const convidadosRoutes = require('./routes/convidados')(pool);
const rulesRoutes = require('./routes/rules')(pool);
const birthdayReservationsRouter = require('./routes/birthdayReservations')(pool);

// AQUI ESTÁ A CORREÇÃO MAIS IMPORTANTE:
// 1. A rota de upload de imagens está no arquivo images.js, que exporta uma função que espera o pool.
// 2. A rota de CRUD do cardápio está no arquivo cardapio.js, que também espera o pool.
// 3. A rota de bares/estabelecimentos está no arquivo bars.js, que também espera o pool.
const imagesRouter = require('./routes/images');
const cardapioRoutes = require('./routes/cardapio');
const barsRoutes = require('./routes/bars');

// Rotas do sistema de reservas do restaurante
const restaurantReservationsRouter = require('./routes/restaurantReservations')(pool);
const walkInsRouter = require('./routes/walkIns')(pool);
const waitlistRouter = require('./routes/waitlist')(pool);
const restaurantAreasRouter = require('./routes/restaurantAreas')(pool);
const specialDatesRouter = require('./routes/specialDates')(pool);
const reportsRouter = require('./routes/reports')(pool);


// Usando as Rotas
app.use('/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/places', placeRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/reservas', reservasRouter);
app.use('/api/qrcode', qrcodeRoutes);
app.use('/api/convidados', convidadosRoutes);
app.use('/api/checkin', checkinRoutes);
app.use('/convite', inviteRoutes);
app.use('/api/events/:eventId/rules', rulesRoutes);
app.use('/api/birthday-reservations', birthdayReservationsRouter);

// Montando as rotas de forma correta e separada
// A rota de upload agora está em /api/images, como você sugeriu
app.use('/api/images', imagesRouter(pool));
// A rota do cardápio está em /api/cardapio
app.use('/api/cardapio', cardapioRoutes(pool));
// A rota de bares/estabelecimentos está em /api/bars
app.use('/api/bars', barsRoutes(pool));

// Rotas do sistema de reservas do restaurante
app.use('/api/restaurant-reservations', restaurantReservationsRouter);
app.use('/api/walk-ins', walkInsRouter);
app.use('/api/waitlist', waitlistRouter);
app.use('/api/restaurant-areas', restaurantAreasRouter);
app.use('/api/special-dates', specialDatesRouter);
app.use('/api/reports', reportsRouter);

// Health check para o Render
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});


// Iniciar o servidor
server.listen(PORT, config.server.host, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`🌐 CORS origins: ${config.server.cors.origin.join(', ')}`);
});
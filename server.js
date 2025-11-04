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
const restaurantReservationsRoutes = require('./routes/restaurantReservations');
const walkInsRoutes = require('./routes/walkIns');
const waitlistRoutes = require('./routes/waitlist');
const restaurantAreasRoutes = require('./routes/restaurantAreas');
const restaurantTablesRoutes = require('./routes/restaurantTables');
const largeReservationsRoutes = require('./routes/largeReservations');
const guestListPublicRoutes = require('./routes/guestListPublic');
const guestListsAdminRoutes = require('./routes/guestListsAdmin');
const actionLogsRoutes = require('./routes/actionLogs');
const eventosRoutes = require('./routes/eventos');
const operationalDetailsRoutes = require('./routes/operationalDetails');


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
// A rota de reservas de restaurante está em /api/restaurant-reservations
app.use('/api/restaurant-reservations', restaurantReservationsRoutes(pool));
// A rota de walk-ins está em /api/walk-ins
app.use('/api/walk-ins', walkInsRoutes(pool));
// A rota de waitlist está em /api/waitlist
app.use('/api/waitlist', waitlistRoutes(pool));
// A rota de áreas do restaurante está em /api/restaurant-areas
app.use('/api/restaurant-areas', restaurantAreasRoutes(pool));
// A rota de mesas do restaurante está em /api/restaurant-tables
app.use('/api/restaurant-tables', restaurantTablesRoutes(pool));
// A rota de reservas grandes está em /api/large-reservations
app.use('/api/large-reservations', largeReservationsRoutes(pool));
// Rotas de lista de convidados
app.use('/api/guest-list', guestListPublicRoutes(pool));
app.use('/api/admin', guestListsAdminRoutes(pool));
// Rota de logs de ações
app.use('/api/action-logs', actionLogsRoutes(pool));
// Rotas do módulo de Eventos e Listas
// Nota: Todas as rotas estão no mesmo router com prefixo /api/v1/eventos
app.use('/api/v1/eventos', eventosRoutes(pool));
// Rotas de Detalhes Operacionais
app.use('/api/v1/operational-details', operationalDetailsRoutes(pool));

// Rotas do sistema avançado de Promoters
const promotersAdvancedRoutes = require('./routes/promotersAdvanced');
app.use('/api/v1/promoters', promotersAdvancedRoutes(pool));

// Rotas públicas de Promoters (para convidados)
const promoterPublicRoutes = require('./routes/promoterPublic');
app.use('/api/promoter', promoterPublicRoutes(pool));

// Rotas de relacionamento promoter-eventos
const promoterEventosRoutes = require('./routes/promoterEventos');
app.use('/api/promoter-eventos', promoterEventosRoutes(pool));

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
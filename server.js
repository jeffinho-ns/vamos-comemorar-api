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

// Importante para rate limiting e logging correto de IP quando atrás de proxy/CDN (Render/Cloudflare)
app.set('trust proxy', 1);

app.set('socketio', io);

const pool = require('./config/database');

// Disponibilizar pool para as rotas
app.set('pool', pool);
app.set('ftpConfig', config.ftp);

const PORT = config.server.port;

// Middleware
app.use(cors(config.server.cors));

// Garantir que o preflight OPTIONS responda sempre com CORS (evita bloqueio a partir de agilizaiapp.com.br etc.)
const allowedOrigins = config.server.cors.origin || [];
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', (config.server.cors.methods || ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']).join(', '));
      res.setHeader('Access-Control-Allow-Headers', (config.server.cors.allowedHeaders || ['Content-Type', 'Authorization', 'X-Requested-With', 'Content-Length']).join(', '));
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    return res.status(204).end();
  }
  next();
});

app.use(express.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '100mb' }));

// Middleware para logs de requisições
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  }
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
const restaurantReservationBlocksRoutes = require('./routes/restaurantReservationBlocks');
const restaurantReservationSettingsRoutes = require('./routes/restaurantReservationSettings');
const walkInsRoutes = require('./routes/walkIns');
const waitlistRoutes = require('./routes/waitlist');
const restaurantAreasRoutes = require('./routes/restaurantAreas');
const restaurantTablesRoutes = require('./routes/restaurantTables');
const largeReservationsRoutes = require('./routes/largeReservations');
const guestListPublicRoutes = require('./routes/guestListPublic');
const guestListsAdminRoutes = require('./routes/guestListsAdmin');
const giftRulesModule = require('./routes/giftRules');
const actionLogsRoutes = require('./routes/actionLogs');
const eventosRoutes = require('./routes/eventos');
const adminDashboardRoutes = require('./routes/adminDashboard');
const operationalDetailsRoutes = require('./routes/operationalDetails');
const checkinsSelfValidateRoutes = require('./routes/checkinsSelfValidate');
const executiveEventsRoutes = require('./routes/executiveEvents');
const establishmentPermissionsRoutes = require('./routes/establishmentPermissions');
const rooftopConductionRoutes = require('./routes/rooftopConduction');
const relatoriosRoutes = require('./routes/relatorios')(pool);
const publicImagesRoutes = require('./routes/publicImages');


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
// Rotas de bloqueio de agenda de reservas de restaurante
app.use('/api/restaurant-reservation-blocks', restaurantReservationBlocksRoutes(pool));
// Configurações de funcionamento de reservas (semanal + exceções por data)
app.use('/api/restaurant-reservation-settings', restaurantReservationSettingsRoutes(pool));
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
// Rotas de check-in automático via QR Code
app.use('/api/checkins', checkinsSelfValidateRoutes(pool));
// Rotas de regras de brindes - precisa ser importado antes de guestListsAdminRoutes
const { router: giftRulesRouter, checkAndAwardGifts, checkAndAwardPromoterGifts } = giftRulesModule(pool);
app.use('/api/gift-rules', giftRulesRouter);
// Passar checkAndAwardGifts para guestListsAdminRoutes
app.use('/api/admin', guestListsAdminRoutes(pool, checkAndAwardGifts));
// Disponibilizar checkAndAwardPromoterGifts para uso em outras rotas
app.set('checkAndAwardPromoterGifts', checkAndAwardPromoterGifts);
// Rota de logs de ações
app.use('/api/action-logs', actionLogsRoutes(pool));
// Rotas do módulo de Eventos e Listas
// Nota: Todas as rotas estão no mesmo router com prefixo /api/v1/eventos
// Passar checkAndAwardPromoterGifts para verificar brindes após check-in de promoters
app.use('/api/v1/eventos', eventosRoutes(pool, checkAndAwardPromoterGifts));
app.use('/api/v1/admin-dashboard', adminDashboardRoutes(pool));
// Rotas de Detalhes Operacionais
app.use('/api/v1/operational-details', operationalDetailsRoutes(pool));
// Rota adicional sem /v1 para compatibilidade
app.use('/api/operational-details', operationalDetailsRoutes(pool));
// Rotas de Executive Event Menus
app.use('/api/executive-events', executiveEventsRoutes(pool));
// Rotas de Permissões por Estabelecimento
app.use('/api/establishment-permissions', establishmentPermissionsRoutes(pool));
// Condução Fluxo Rooftop (GET/POST /api/rooftop/conduction)
app.use('/api/rooftop', rooftopConductionRoutes(pool));
app.use('/api/relatorios', relatoriosRoutes);
// Conteúdo público de imagens (para permitir CDN/cache sem vazar tokens de download)
app.use('/public', publicImagesRoutes);

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

// Endpoint de teste do Cloudinary (apenas para diagnóstico)
app.get('/test-cloudinary', async (req, res) => {
  try {
    const cloudinaryService = require('./services/cloudinaryService');
    
    // Verificar variáveis de ambiente
    const hasCloudName = !!process.env.CLOUDINARY_CLOUD_NAME;
    const hasApiKey = !!process.env.CLOUDINARY_API_KEY;
    const hasApiSecret = !!process.env.CLOUDINARY_API_SECRET;
    
    if (!hasCloudName || !hasApiKey || !hasApiSecret) {
      return res.status(500).json({
        success: false,
        error: 'Variáveis de ambiente não configuradas',
        details: {
          CLOUDINARY_CLOUD_NAME: hasCloudName ? '✅ Configurado' : '❌ Não configurado',
          CLOUDINARY_API_KEY: hasApiKey ? '✅ Configurado' : '❌ Não configurado',
          CLOUDINARY_API_SECRET: hasApiSecret ? '✅ Configurado' : '❌ Não configurado'
        }
      });
    }
    
    // Testar upload de arquivo de teste
    console.log('🧪 Testando Cloudinary...');
    const testBuffer = Buffer.from('Teste Cloudinary - ' + new Date().toISOString());
    const testFileName = `test-${Date.now()}.txt`;
    
    const uploadResult = await cloudinaryService.uploadFile(testFileName, testBuffer, {
      folder: 'test',
      resource_type: 'raw'
    });
    
    if (uploadResult && uploadResult.secureUrl) {
      // Deletar arquivo de teste
      try {
        await cloudinaryService.deleteFile(uploadResult.publicId, { resource_type: 'raw' });
      } catch (deleteError) {
        console.warn('⚠️ Erro ao deletar arquivo de teste:', deleteError.message);
      }
      
      return res.status(200).json({
        success: true,
        message: '✅ Cloudinary funcionando!',
        details: {
          cloudName: process.env.CLOUDINARY_CLOUD_NAME,
          uploadTest: '✅ Sucesso',
          timestamp: new Date().toISOString()
        }
      });
    } else {
      return res.status(500).json({
        success: false,
        error: 'Upload de teste não retornou URL'
      });
    }
  } catch (error) {
    console.error('❌ Erro no teste Cloudinary:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro no Cloudinary',
      details: {
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    });
  }
});

// Endpoint de teste do Firebase Storage (Admin) - útil para validar env no Render
app.get('/test-firebase-storage', async (req, res) => {
  try {
    const firebaseStorage = require('./services/firebaseStorageAdminService');

    const bucket = process.env.FIREBASE_STORAGE_BUCKET;
    if (!bucket) {
      return res.status(500).json({
        success: false,
        error: 'FIREBASE_STORAGE_BUCKET não configurado',
      });
    }

    const objectPath = `health/test-${Date.now()}.txt`;
    const buf = Buffer.from('Firebase Storage test - ' + new Date().toISOString());

    const upload = await firebaseStorage.uploadBuffer({
      objectPath,
      buffer: buf,
      contentType: 'text/plain',
    });

    // tentar deletar
    await firebaseStorage.deleteByUrlOrPath(upload.objectPath);

    return res.status(200).json({
      success: true,
      message: '✅ Firebase Storage (Admin) funcionando!',
      details: {
        bucket,
        objectPath: upload.objectPath,
        url: upload.url,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('❌ Erro no teste Firebase Storage:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro no Firebase Storage',
      details: {
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    });
  }
});


// Socket.IO: permitir que clientes (ex.: páginas de check-in) entrem nas salas por guest_list_id para receber convidado_checkin em tempo real
// e sala rooftop_flow para a página Fluxo Rooftop receber atualizações em tempo real quando um check-in é feito
const { getRoomName } = require('./utils/rooftopFlowSocket');

io.on('connection', (socket) => {
  socket.on('join_guest_list', (guestListId) => {
    if (guestListId != null && guestListId !== '') {
      const room = 'guest_list_' + guestListId;
      socket.join(room);
    }
  });

  socket.on('join_rooftop_flow', (payload) => {
    const establishmentId = payload?.establishment_id;
    const flowDate = payload?.flow_date;
    if (establishmentId != null && flowDate && typeof flowDate === 'string') {
      const room = getRoomName(establishmentId, flowDate.trim());
      socket.join(room);
    }
  });
});

// Iniciar o servidor
server.listen(PORT, config.server.host, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`🌐 CORS origins: ${config.server.cors.origin.join(', ')}`);
});
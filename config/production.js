// Configuração de ambiente para produção (Render)
module.exports = {
  // Configurações do servidor
  server: {
    port: process.env.PORT || 10000,
    host: '0.0.0.0',
    cors: {
      origin: [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
        'https://vamos-comemorar-next.vercel.app',
        "https://agilizaiapp.com.br",
        "https://www.agilizaiapp.com.br",
        'https://grupoideiaum.com.br',
        'https://www.grupoideiaum.com.br'
      ],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Content-Length']
    }
  },

  // Configurações do banco de dados
  database: {
    host: process.env.DB_HOST || '',
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || '',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  },

  // Configurações FTP — credenciais somente via env (FTP_HOST, FTP_USER, FTP_PASSWORD)
  ftp: {
    host: process.env.FTP_HOST || '',
    user: process.env.FTP_USER || '',
    password: process.env.FTP_PASSWORD || '',
    secure: false,
    port: 21,
    remoteDirectory: '/public_html/cardapio-agilizaiapp/',
    baseUrl: 'https://grupoideiaum.com.br/cardapio-agilizaiapp/'
  },

  // Configurações de upload
  upload: {
    maxFileSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
    localUploadDir: 'uploads/cardapio'
  }
};

// Configuração de ambiente para produção
module.exports = {
  // Configurações do servidor
  server: {
    port: process.env.PORT || 10000,
    host: '0.0.0.0',
    cors: {
      origin: [
        'https://vamos-comemorar-next.vercel.app',
        'https://vamos-comemorar-mobile.vercel.app',
        'https://grupoideiaum.com.br',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001'
      ],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }
  },

  // Configurações do banco de dados
  database: {
    host: process.env.DB_HOST || '193.203.175.55',
    user: process.env.DB_USER || 'u621081794_vamos',
    password: process.env.DB_PASSWORD || '@123Mudar!@',
    database: process.env.DB_NAME || 'u621081794_vamos',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  },

  // Configurações FTP (AJUSTADO)
  ftp: {
    host: process.env.FTP_HOST || '195.35.41.247',
    user: process.env.FTP_USER || 'u621081794',
    password: process.env.FTP_PASSWORD || 'Jeffl1ma!@',
    secure: false,
    port: 21,
    remoteDirectory: '/home/u621081794/domains/grupoideiaum.com.br/public_html/cardapio-agilizaiapp/',
    baseUrl: 'https://grupoideiaum.com.br/cardapio-agilizaiapp/'
  },

  // Configurações de upload
  upload: {
    maxFileSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
    localUploadDir: 'uploads/cardapio'
  }
};

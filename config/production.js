// Configuração para ambiente de produção
module.exports = {
  // Configurações do servidor
  server: {
    port: process.env.PORT || 5001,
    host: '0.0.0.0',
    cors: {
      origin: [
        'https://vamos-comemorar-next.vercel.app',
        'https://vamos-comemorar-mobile.vercel.app',
        'https://grupoideiaum.com.br',
        'https://vamos-comemorar-next.vercel.app',
        'http://localhost:3000', // Para desenvolvimento local
        'http://localhost:3001', // Para desenvolvimento local
        'http://127.0.0.1:3000', // Para desenvolvimento local
        'http://127.0.0.1:3001'  // Para desenvolvimento local
      ],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }
  },

  // Configurações do banco de dados
  database: {
    host: '193.203.175.55',
    user: 'u621081794_vamos',
    password: '@123Mudar!@',
    database: 'u621081794_vamos',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  },

  // Configurações FTP (AJUSTADO)
  ftp: {
    host: '195.35.41.247',
    user: 'u621081794',
    password: 'Jeffl1ma!@',
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

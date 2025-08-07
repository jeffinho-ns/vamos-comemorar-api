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
        'https://www.grupoideiaum.com.br',
        'http://localhost:3000' // Para desenvolvimento local
      ],
      credentials: true
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

  // Configurações FTP
  ftp: {
    host: '195.35.41.247',
    user: 'u621081794',
    password: 'Jeffl1ma!@',
    secure: false,
    port: 21,
    remoteDirectory: '/cardapio-agilizaiapp/',
    baseUrl: 'https://www.grupoideiaum.com.br/cardapio-agilizaiapp/'
  },

  // Configurações de upload
  upload: {
    maxFileSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
    localUploadDir: 'uploads/cardapio'
  }
}; 
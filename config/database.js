const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: '193.203.175.55',
  user: 'u621081794_vamos',
  password: '@123Mudar!@',
  database: 'u621081794_vamos',
    waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool; 

const mysql = require('mysql2');

const pool = mysql.createPool({
    host: '193.203.175.55',
    user: 'u621081794_vamos',
    password: '@123Mudar!@',
    database: 'u621081794_vamos',
});

// aqui você transforma o pool em uma versão que suporta Promises
const promisePool = pool.promise();

module.exports = promisePool;

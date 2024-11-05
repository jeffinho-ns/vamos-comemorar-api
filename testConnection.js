const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: '193.203.175.55', // Seu host do banco de dados
    user: 'u621081794_vamos', // Seu usuário do banco de dados
    password: '@123Mudar!@', // Sua senha do banco de dados
    database: 'u621081794_vamos', // Seu banco de dados
});

async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log("Conexão bem-sucedida com o banco de dados!");

        // Executar uma consulta simples para verificar se a conexão está funcionando
        const [results] = await connection.query('SELECT 1 + 1 AS solution');
        console.log('Resultado da consulta: ', results[0].solution); // Deveria imprimir "Resultado da consulta: 2"

        connection.release(); // Libera a conexão de volta ao pool
    } catch (error) {
        console.error("Erro ao conectar ao banco de dados:", error);
    }
}

testConnection();

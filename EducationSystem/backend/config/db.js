const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER, 
    database: process.env.DB_NAME,
    options: {
        encrypt: false, 
        trustServerCertificate: true,
        enableArithAbort: true
    }
};

const connectDB = async () => {
    try {
        const pool = await sql.connect(dbConfig);
        console.log('Подключение к MSSQL установлено успешно');
        return pool;
    } catch (error) {
        console.error('Ошибка подключения к БД: ', error.message);
        process.exit(1);
    }
};

module.exports = { sql, connectDB };
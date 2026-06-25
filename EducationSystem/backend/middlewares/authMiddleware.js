const jwt = require('jsonwebtoken');
const { sql } = require('../config/db');

const verifyToken = async (req, res, next) => {
    const authHeader = req.header('Authorization');
    const token = authHeader?.split(' ')[1];

    if (!token) return res.status(401).json({ message: 'Токен отсутствует.' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const result = await sql.query`SELECT IsBlocked FROM Users WHERE Id = ${decoded.userId}`;
        const dbUser = result.recordset[0];

        if (!dbUser) return res.status(401).json({ message: 'Пользователь не найден.' });
        if (dbUser.IsBlocked) return res.status(403).json({ message: 'Аккаунт заблокирован.' });

        req.user = decoded; 
        next();
    } catch (error) {
        console.error('Ошибка верификации токена:', error.message);
        res.status(401).json({ message: 'Сессия истекла. Войдите заново.' });
    }
};

const requireRole = (rolesArray) => (req, res, next) => {
    if (!rolesArray.includes(req.user.role)) {
        return res.status(403).json({ message: 'Недостаточно прав.' });
    }
    next();
};

module.exports = { verifyToken, requireRole };
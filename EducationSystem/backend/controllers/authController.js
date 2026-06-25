const { sql } = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
    const { username, password, firstName, lastName, middleName } = req.body;
    try {
        const userExists = await sql.query`SELECT 1 FROM Users WHERE Username = ${username}`;
        if (userExists.recordset.length > 0) {
            return res.status(400).json({ message: 'Пользователь с таким логином уже существует' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        await sql.query`INSERT INTO Users (Username, PasswordHash, RoleId, FirstName, LastName, MiddleName, IsBlocked) 
                        VALUES (${username}, ${passwordHash}, 1, ${firstName}, ${lastName}, ${middleName}, 0)`;
        
        res.status(201).json({ message: 'Регистрация успешна' });
    } catch (err) { 
        res.status(500).json({ message: 'Ошибка сервера при регистрации' }); 
    }
};

exports.login = async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await sql.query`SELECT u.*, r.RoleName FROM Users u JOIN Roles r ON u.RoleId = r.Id WHERE u.Username = ${username}`;
        const user = result.recordset[0];
        
        if (!user) return res.status(400).json({ message: 'Неверный логин или пароль' });
        if (user.IsBlocked) return res.status(403).json({ message: 'Ваш аккаунт заблокирован' });

        const isMatch = await bcrypt.compare(password, user.PasswordHash);
        if (!isMatch) return res.status(400).json({ message: 'Неверный логин или пароль' });

        const token = jwt.sign({ 
            userId: user.Id, 
            role: user.RoleName, 
            username: user.Username,
            firstName: user.FirstName,
            lastName: user.LastName,
            middleName: user.MiddleName
        }, process.env.JWT_SECRET, { expiresIn: '24h' });
        
        res.json({ 
            token, 
            role: user.RoleName, 
            username: user.Username, 
            firstName: user.FirstName, 
            lastName: user.LastName, 
            middleName: user.MiddleName 
        });
    } catch (err) { res.status(500).json({ message: ' Ошибка сервера' }); }
};

exports.updateProfile = async (req, res) => {
    const { newUsername, oldPassword, newPassword, newFirstName, newLastName, newMiddleName } = req.body;
    try {
        const currentUserResult = await sql.query`
            SELECT u.*, r.RoleName
            FROM Users u
            JOIN Roles r ON u.RoleId = r.Id
            WHERE u.Id = ${req.user.userId}
        `;
        const currentUser = currentUserResult.recordset[0];
        if (!currentUser) return res.status(404).json({ message: 'Пользователь не найден' });

        if (newUsername) {
            const userExists = await sql.query`SELECT 1 FROM Users WHERE Username = ${newUsername} AND Id != ${req.user.userId}`;
            if (userExists.recordset.length > 0) return res.status(400).json({ message: 'Этот логин уже занят' });
            await sql.query`UPDATE Users SET Username = ${newUsername} WHERE Id = ${req.user.userId}`;
        }

        if (newFirstName) await sql.query`UPDATE Users SET FirstName = ${newFirstName} WHERE Id = ${req.user.userId}`;
        if (newLastName) await sql.query`UPDATE Users SET LastName = ${newLastName} WHERE Id = ${req.user.userId}`;
        if (newMiddleName) await sql.query`UPDATE Users SET MiddleName = ${newMiddleName} WHERE Id = ${req.user.userId}`;

        if (newPassword) {
            if (!oldPassword) return res.status(400).json({ message: 'Введите текущий пароль' });
            const isOldPasswordValid = await bcrypt.compare(oldPassword, currentUser.PasswordHash);
            if (!isOldPasswordValid) return res.status(400).json({ message: 'Неверный текущий пароль' });

            const salt = await bcrypt.genSalt(10);
            const hash = await bcrypt.hash(newPassword, salt);
            await sql.query`UPDATE Users SET PasswordHash = ${hash} WHERE Id = ${req.user.userId}`;
        }

        const updatedUserResult = await sql.query`
            SELECT u.*, r.RoleName
            FROM Users u
            JOIN Roles r ON u.RoleId = r.Id
            WHERE u.Id = ${req.user.userId}
        `;
        const updatedUser = updatedUserResult.recordset[0];

        const token = jwt.sign({
            userId: updatedUser.Id,
            role: updatedUser.RoleName,
            username: updatedUser.Username,
            firstName: updatedUser.FirstName,
            lastName: updatedUser.LastName,
            middleName: updatedUser.MiddleName
        }, process.env.JWT_SECRET, { expiresIn: '24h' });

        res.json({
            message: 'Обновлено',
            token,
            user: {
                username: updatedUser.Username,
                firstName: updatedUser.FirstName,
                lastName: updatedUser.LastName,
                middleName: updatedUser.MiddleName
            }
        });
    } catch (err) { res.status(500).json({ message: 'Ошибка обновления' }); }
};

exports.getProfile = async (req, res) => {
    try {
        const result = await sql.query`SELECT FirstName, LastName, MiddleName, Username, CreatedAt, r.RoleName 
                                       FROM Users u JOIN Roles r ON u.RoleId = r.Id 
                                       WHERE u.Id = ${req.user.userId}`;
        res.json(result.recordset[0]);
    } catch (err) { res.status(500).json({ message: 'Ошибка сервера' }); }
};
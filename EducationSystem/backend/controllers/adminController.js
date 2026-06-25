const { sql } = require('../config/db');

const getActiveAdminsCount = async () => {
    const adminsResult = await sql.query`
        SELECT COUNT(1) AS Count
        FROM Users
        WHERE RoleId = 3 AND IsBlocked = 0
    `;
    return adminsResult.recordset[0].Count;
};

exports.getAllUsers = async (req, res) => {
    const result = await sql.query`SELECT u.Id, u.Username, u.FirstName, u.LastName, u.MiddleName, u.IsBlocked, r.RoleName, u.RoleId FROM Users u JOIN Roles r ON u.RoleId = r.Id`;
    res.json(result.recordset);
};

exports.updateUserRole = async (req, res) => {
    const { userId, newRoleId } = req.body;
    const targetId = parseInt(userId, 10);
    const nextRoleId = parseInt(newRoleId, 10);

    if (targetId === req.user.userId) {
        return res.status(400).json({ message: 'Вы не можете изменить роль самому себе.' });
    }

    const targetResult = await sql.query`SELECT Id, RoleId, IsBlocked FROM Users WHERE Id = ${targetId}`;
    const targetUser = targetResult.recordset[0];
    if (!targetUser) {
        return res.status(404).json({ message: 'Пользователь не найден.' });
    }

    if (targetUser.RoleId === 3 && nextRoleId !== 3 && !targetUser.IsBlocked) {
        const activeAdminsCount = await getActiveAdminsCount();
        if (activeAdminsCount <= 1) {
            return res.status(400).json({ message: 'Нельзя изменить роль последнего активного администратора.' });
        }
    }

    await sql.query`UPDATE Users SET RoleId = ${nextRoleId} WHERE Id = ${targetId}`;
    res.json({ message: 'Роль обновлена' });
};

exports.toggleBlock = async (req, res) => {
    const { userId, isBlocked } = req.body;
    const targetId = parseInt(userId, 10);

    if (targetId === req.user.userId) {
        return res.status(400).json({ message: 'Вы не можете заблокировать самого себя.' });
    }

    const targetResult = await sql.query`SELECT Id, RoleId, IsBlocked FROM Users WHERE Id = ${targetId}`;
    const targetUser = targetResult.recordset[0];
    if (!targetUser) {
        return res.status(404).json({ message: 'Пользователь не найден.' });
    }

    const willBeBlocked = !!isBlocked;
    if (targetUser.RoleId === 3 && willBeBlocked && !targetUser.IsBlocked) {
        const activeAdminsCount = await getActiveAdminsCount();
        if (activeAdminsCount <= 1) {
            return res.status(400).json({ message: 'Нельзя заблокировать последнего активного администратора.' });
        }
    }

    await sql.query`UPDATE Users SET IsBlocked = ${willBeBlocked ? 1 : 0} WHERE Id = ${targetId}`;
    res.json({ message: 'Статус изменен' });
};

exports.deleteUser = async (req, res) => {
    const userId = parseInt(req.params.id, 10);

    if (Number.isNaN(userId)) {
        return res.status(400).json({ message: 'Некорректный ID пользователя.' });
    }

    if (userId === req.user.userId) {
        return res.status(400).json({ message: 'Вы не можете удалить самого себя.' });
    }

    const userResult = await sql.query`
        SELECT Id, RoleId FROM Users WHERE Id = ${userId}
    `;

    const targetUser = userResult.recordset[0];
    if (!targetUser) {
        return res.status(404).json({ message: 'Пользователь не найден.' });
    }

    if (targetUser.RoleId === 3) {
        const activeAdminsCount = await getActiveAdminsCount();
        const isTargetActiveAdmin = targetUser.IsBlocked === 0;
        if (isTargetActiveAdmin && activeAdminsCount <= 1) {
            return res.status(400).json({ message: 'Нельзя удалить последнего активного администратора.' });
        }
    }

    const materialsResult = await sql.query`
        SELECT COUNT(1) AS Count
        FROM EducationalMaterials
        WHERE TeacherId = ${userId}
    `;
    const materialsCount = materialsResult.recordset[0].Count;

    if (materialsCount > 0) {
        return res.status(400).json({
            message: `Нельзя удалить пользователя: у него есть учебные материалы (${materialsCount}).`
        });
    }

    await sql.query`DELETE FROM Users WHERE Id = ${userId}`;
    res.json({ message: 'Пользователь удален.' });
};

exports.getAIConfigs = async (req, res) => {
    const result = await sql.query`SELECT * FROM SystemConfigs`;
    res.json(result.recordset);
};

exports.updateAIConfig = async (req, res) => {
    const { key, value } = req.body;

    if (key === 'AI_TEMPERATURE') {
        const num = parseFloat(value);
        if (isNaN(num) || num < 0 || num > 1) {
            return res.status(400).json({ message: 'Температура должна быть числом от 0 до 1' });
        }
    }
    if (key === 'MAX_TOKENS') {
        if (isNaN(parseInt(value))) {
            return res.status(400).json({ message: 'Токены должны быть целым числом' });
        }
    }

    try {
        await sql.query`
            IF EXISTS (SELECT 1 FROM SystemConfigs WHERE ConfigKey = ${key})
                UPDATE SystemConfigs SET ConfigValue = ${value} WHERE ConfigKey = ${key}
            ELSE
                INSERT INTO SystemConfigs (ConfigKey, ConfigValue) VALUES (${key}, ${value})
        `;
        res.json({ message: 'Настройка сохранена' });
    } catch (err) {
        res.status(500).json({ message: 'Ошибка БД' });
    }
};

const getAllowedGroqModelIds = () => {
    const raw = process.env.AI_MODEL_ALLOWLIST;
    if (raw && `${raw}`.trim()) {
        return `${raw}`.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return ['llama-3.3-70b-versatile', 'meta-llama/llama-4-scout-17b-16e-instruct'];
};

const fallbackModelsForAdmin = () =>
    getAllowedGroqModelIds().map((id) => ({ id, name: id }));

exports.getGroqModels = async (req, res) => {
    try {
        const apiKey = process.env.AI_API_KEY;
        const baseUrl = process.env.AI_BASE_URL;
        const allowedIds = getAllowedGroqModelIds();
        const allowedSet = new Set(allowedIds);

        const response = await fetch(`${baseUrl}/models`, {
            headers: { "Authorization": `Bearer ${apiKey}` }
        });

        const data = await response.json();
        const rows = Array.isArray(data?.data) ? data.data : [];

        const activeModels = rows
            .filter((m) => m && typeof m.id === 'string')
            .filter((m) => !m.id.includes('whisper') && !m.id.includes('guard'))
            .filter((m) => allowedSet.has(m.id))
            .map((m) => ({ id: m.id, name: m.id }))
            .sort((a, b) => allowedIds.indexOf(a.id) - allowedIds.indexOf(b.id));

        if (activeModels.length > 0) {
            return res.json(activeModels);
        }

        return res.json(fallbackModelsForAdmin());
    } catch (error) {
        res.json(fallbackModelsForAdmin());
    }
};

exports.getCategories = async (req, res) => {
    try {
        const result = await sql.query`SELECT * FROM Categories ORDER BY CategoryName`;
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ message: 'Ошибка БД' }); }
};

exports.addCategory = async (req, res) => {
    const rawName = req.body.name || '';
    const name = rawName.trim();

    const catRegex = /^[a-zA-Zа-яА-ЯёЁ\s-]+$/;
    if (!name || name.length < 2 || name.length > 50 || !catRegex.test(name)) {
        return res.status(400).json({ message: 'Некорректное название (2-50 символов, только буквы и дефис)' });
    }

    try {
        await sql.query`INSERT INTO Categories (CategoryName) VALUES (${name})`;
        res.json({ message: 'Категория добавлена' });
    } catch (err) { res.status(400).json({ message: 'Такая категория уже существует' }); }
};

exports.updateCategory = async (req, res) => {
    const categoryId = parseInt(req.params.id, 10);
    const rawName = req.body.name || '';
    const name = rawName.trim();

    if (Number.isNaN(categoryId)) {
        return res.status(400).json({ message: 'Некорректный ID категории.' });
    }

    const catRegex = /^[a-zA-Zа-яА-ЯёЁ\s-]+$/;
    if (!name || name.length < 2 || name.length > 50 || !catRegex.test(name)) {
        return res.status(400).json({ message: 'Некорректное название (2-50 символов, только буквы и дефис)' });
    }

    try {
        const existsResult = await sql.query`SELECT Id FROM Categories WHERE Id = ${categoryId}`;
        if (!existsResult.recordset[0]) {
            return res.status(404).json({ message: 'Категория не найдена.' });
        }

        await sql.query`UPDATE Categories SET CategoryName = ${name} WHERE Id = ${categoryId}`;
        res.json({ message: 'Категория обновлена' });
    } catch (err) {
        res.status(400).json({ message: 'Такая категория уже существует' });
    }
};

exports.deleteCategory = async (req, res) => {
    try {
        const categoryId = parseInt(req.params.id, 10);
        if (Number.isNaN(categoryId)) {
            return res.status(400).json({ message: 'Некорректный ID категории.' });
        }

        const inUseResult = await sql.query`
            SELECT COUNT(1) AS Count
            FROM EducationalMaterials
            WHERE CategoryId = ${categoryId}
        `;

        if (inUseResult.recordset[0].Count > 0) {
            return res.status(400).json({ message: 'Нельзя удалить категорию, которая используется в материалах.' });
        }

        await sql.query`DELETE FROM Categories WHERE Id = ${categoryId}`;
        res.json({ message: 'Удалено' });
    } catch (err) { res.status(500).json({ message: 'Ошибка. Возможно, категория используется в материалах.' }); }
};
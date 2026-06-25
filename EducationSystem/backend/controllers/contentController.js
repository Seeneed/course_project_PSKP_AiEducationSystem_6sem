const fs = require('fs');
const pdfParse = require('pdf-extraction');
const mammoth = require('mammoth');
const aiService = require('../services/aiService');
const { sql } = require('../config/db');

const cleanText = (value) => {
    if (typeof value !== 'string') return value;
    return value
        .normalize('NFKC')
        .replace(/\uFFFD/g, '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g, '')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
        .replace(/\r/g, '')
        .trim();
};

const removeUploadedFile = (fileRef) => {
    if (!fileRef?.path) return;
    try {
        if (fs.existsSync(fileRef.path)) fs.unlinkSync(fileRef.path);
    } catch (_) {}
};

const mapDocumentReadError = (err) => {
    const raw = err && err.message ? String(err.message) : '';
    const m = raw.toLowerCase();
    if (
        raw.includes('End of data reached') ||
        m.includes('corrupted zip') ||
        raw.includes('data length = 0') ||
        m.includes('invalid zip') ||
        m.includes('central directory') ||
        m.includes('unexpected end')
    ) {
        return 'Файл не удалось прочитать: он пустой, повреждён или загрузился не полностью. Проверьте размер файла на диске, откройте документ в Word или другой программе, выполните «Сохранить как» и отправьте снова.';
    }
    if (m.includes('password') || m.includes('encrypt')) {
        return 'Документ защищён паролем. Снимите защиту и загрузите файл снова.';
    }
    return '';
};

const sanitizeMaterialContent = (material) => {
    if (!material) return material;

    const terms = Array.isArray(material.Terms)
        ? material.Terms.map(t => ({
            ...t,
            term: cleanText(t?.term || ''),
            definition: cleanText(t?.definition || '')
        }))
        : [];

    const quizzes = Array.isArray(material.Quizzes)
        ? material.Quizzes.map(q => ({
            ...q,
            question: cleanText(q?.question || ''),
            options: Array.isArray(q?.options) ? q.options.map(o => cleanText(o || '')) : []
        }))
        : [];

    return {
        ...material,
        Summary: aiService.normalizeSummaryParagraphSpacing(cleanText(material.Summary || '')),
        Terms: terms,
        Quizzes: quizzes,
        SelfCheck: Array.isArray(material.SelfCheck) ? material.SelfCheck.map(q => cleanText(q || '')) : [],
        PracticalTask: material.PracticalTask
            ? {
                ...material.PracticalTask,
                scenario: cleanText(material.PracticalTask?.scenario || ''),
                questions: Array.isArray(material.PracticalTask?.questions)
                    ? material.PracticalTask.questions.map(q => cleanText(q || ''))
                    : []
            }
            : null
    };
};

const normalizeQuiz = (q) => {
    const indices = Array.isArray(q?.correctAnswerIndices)
        ? q.correctAnswerIndices.filter(i => Number.isInteger(i) && i >= 0 && i <= 3)
        : (Number.isInteger(q?.correctAnswerIndex) ? [q.correctAnswerIndex] : []);

    return {
        ...q,
        correctAnswerIndices: indices
    };
};

const normalizeQuizzes = (quizzes) => (Array.isArray(quizzes) ? quizzes.map(normalizeQuiz) : []);

const titleRegex = /^[a-zA-Zа-яА-ЯёЁ0-9\s\-.,:()!?«»"']+$/;
const validateTitle = (title) => {
    const normalizedTitle = cleanText(title || '');
    if (!normalizedTitle || normalizedTitle.length < 5 || normalizedTitle.length > 120) {
        return 'Название темы должно быть длиной от 5 до 120 символов.';
    }
    if (!titleRegex.test(normalizedTitle)) {
        return 'Название содержит недопустимые символы.';
    }
    if (!/[a-zA-Zа-яА-ЯёЁ]{3,}/.test(normalizedTitle)) {
        return 'Название должно содержать осмысленный текст.';
    }
    return null;
};

const getQuizCountLimits = (summaryLengthRaw) => {
    const key = `${summaryLengthRaw || ''}`.trim().toLowerCase();
    if (key === 'краткий') return { min: 3, max: 5, hint: 'кратком конспекте' };
    if (key === 'подробный') return { min: 3, max: 15, hint: 'подробном конспекте' };
    return { min: 3, max: 8, hint: 'среднем объёме конспекта' };
};

const validateQuizCountForSummaryLength = (summaryLength, quizCountRaw) => {
    const count = parseInt(quizCountRaw, 10);
    if (!Number.isInteger(count)) {
        return 'Укажите целое число вопросов в тесте.';
    }
    const { min, max, hint } = getQuizCountLimits(summaryLength);
    if (count < min || count > max) {
        return `Для ${hint} допустимо от ${min} до ${max} вопросов. При большем числе часть вопросов может уйти за пределы конспекта и опираться на исходный файл вместо сжатого текста.`;
    }
    return null;
};

const validateMaterialPayload = (payload) => {
    const { Title, Summary, Terms, Quizzes, SelfCheck, PracticalTask } = payload;

    const titleError = validateTitle(Title);
    if (titleError) return titleError;
    const normalizedSummary = aiService.normalizeSummaryParagraphSpacing(cleanText(Summary || ''));
    if (!normalizedSummary) return 'Конспект не должен быть пустым.';
    if (normalizedSummary.length < 50) return 'Конспект слишком короткий (минимум 50 символов).';

    if (!Array.isArray(Terms) || Terms.length === 0) return 'Должен быть хотя бы 1 термин.';
    const invalidTerm = Terms.some(t => !cleanText(t?.term) || !cleanText(t?.definition));
    if (invalidTerm) return 'У каждого термина должны быть заполнены название и определение.';

    if (!Array.isArray(Quizzes) || Quizzes.length === 0) return 'Должен быть хотя бы 1 тестовый вопрос.';
    const invalidQuiz = Quizzes.some(q => {
        const hasQuestion = !!cleanText(q?.question);
        const hasOptions = Array.isArray(q?.options) && q.options.length === 4 && q.options.every(o => !!cleanText(o));
        const hasMultiIndex = Array.isArray(q?.correctAnswerIndices) && q.correctAnswerIndices.length > 0;
        return !hasQuestion || !hasOptions || !hasMultiIndex;
    });
    if (invalidQuiz) return 'Тесты заполнены некорректно.';

    if (!Array.isArray(SelfCheck) || SelfCheck.length === 0) return 'Добавьте вопросы для самопроверки.';
    if (SelfCheck.some(q => !cleanText(q))) return 'В самопроверке не должно быть пустых строк.';

    if (!PracticalTask || !cleanText(PracticalTask.scenario)) return 'Ситуационная задача должна содержать сценарий.';
    if (!Array.isArray(PracticalTask.questions) || PracticalTask.questions.length === 0) {
        return 'Ситуационная задача должна содержать вопросы.';
    }
    if (PracticalTask.questions.some(q => !cleanText(q))) return 'В вопросах ситуационной задачи не должно быть пустых строк.';

    return null;
};

const getGenerationBootstrapStatus = async () => {
    const categoriesRes = await sql.query`SELECT COUNT(1) AS Count FROM Categories`;
    const categoriesCount = categoriesRes.recordset[0].Count;

    const configResult = await sql.query`SELECT ConfigKey, ConfigValue FROM SystemConfigs`;
    const configs = {};
    configResult.recordset.forEach(c => { configs[c.ConfigKey] = c.ConfigValue; });

    const requiredKeys = ['AI_MODEL', 'SYSTEM_PROMPT', 'AI_TEMPERATURE', 'MAX_TOKENS'];
    const missingConfigs = requiredKeys.filter(k => !configs[k] || !`${configs[k]}`.trim());

    return {
        categoriesCount,
        hasCategories: categoriesCount > 0,
        missingConfigs,
        isReady: categoriesCount > 0 && missingConfigs.length === 0
    };
};

exports.uploadAndGenerate = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'Файл не выбран' });

        const { title, summaryLength, quizCount, category } = req.body; 
        const normalizedTitle = cleanText(title || '');

        const titleError = validateTitle(normalizedTitle);
        if (titleError) return res.status(400).json({ message: titleError });

        const quizCountError = validateQuizCountForSummaryLength(summaryLength, quizCount);
        if (quizCountError) return res.status(400).json({ message: quizCountError });

        const bootstrapStatus = await getGenerationBootstrapStatus();
        if (!bootstrapStatus.hasCategories) {
            return res.status(400).json({ message: 'Невозможно запустить генерацию: категории не настроены администратором.' });
        }
        if (bootstrapStatus.missingConfigs.length > 0) {
            return res.status(400).json({
                message: `Невозможно запустить генерацию: заполните настройки ИИ (${bootstrapStatus.missingConfigs.join(', ')}) в админ-панели.`
            });
        }

        const checkTitle = await sql.query`
            SELECT 1 FROM EducationalMaterials 
            WHERE TeacherId = ${req.user.userId} AND Title = ${normalizedTitle}
        `;
        if (checkTitle.recordset.length > 0) {
            return res.status(400).json({ message: 'У вас уже есть лекция с таким названием!' });
        }

        const dataBuffer = fs.readFileSync(req.file.path);
        if (!dataBuffer || dataBuffer.length === 0) {
            removeUploadedFile(req.file);
            return res.status(400).json({
                message: 'Загруженный файл пустой (0 байт). Выберите другой файл и убедитесь, что загрузка завершилась.',
            });
        }

        let text = '';
        try {
            if (req.file.mimetype === 'application/pdf') {
                const data = await pdfParse(dataBuffer);
                text = data.text;
            } else {
                const data = await mammoth.extractRawText({ buffer: dataBuffer });
                text = data.value;
            }
        } catch (parseErr) {
            removeUploadedFile(req.file);
            const friendly = mapDocumentReadError(parseErr);
            return res.status(400).json({
                message:
                    friendly ||
                    'Не удалось прочитать файл. Убедитесь, что это корректный PDF или DOCX, не повреждён и не зашифрован.',
            });
        }

        text = cleanText(text || '');
        if (!text) {
            removeUploadedFile(req.file);
            return res.status(400).json({
                message:
                    'Из документа не извлечён текст: файл может быть пустым, состоять только из изображений без текста или повреждён. Попробуйте другой файл или пересохраните документ.',
            });
        }

        const aiResult = await aiService.generateEducationalContent(text, { summaryLength, quizCount });

        await sql.query`
            INSERT INTO EducationalMaterials (
                TeacherId, Title, CategoryId, OriginalFileName, Summary, 
                Terms, Quizzes, SelfCheck, PracticalTask, IsPublished, IsPublic, CreatedAt, UpdatedAt
            )
            VALUES (
                ${req.user.userId}, ${normalizedTitle}, ${category}, ${req.file.originalname}, 
                ${aiResult.summary}, ${JSON.stringify(aiResult.terms)}, 
                ${JSON.stringify(normalizeQuizzes(aiResult.quizzes))}, ${JSON.stringify(aiResult.selfCheck)}, 
                ${JSON.stringify(aiResult.practicalTask)}, 
                0, 0, GETUTCDATE(), GETUTCDATE()
            )
        `;

        fs.unlinkSync(req.file.path);
        res.status(200).json({ message: 'Успешно сгенерировано' });
    } catch (error) {
        removeUploadedFile(req.file);
        res.status(500).json({ message: error.message || 'Ошибка генерации' });
    }
};

exports.getGenerationStatus = async (req, res) => {
    try {
        const status = await getGenerationBootstrapStatus();
        res.json(status);
    } catch (err) {
        res.status(500).json({ message: 'Ошибка проверки готовности генерации' });
    }
};

exports.getAllMaterials = async (req, res) => {
    try {
        let query;
        const baseQuery = `
            SELECT m.*, u.FirstName, u.LastName, u.MiddleName, c.CategoryName 
            FROM EducationalMaterials m
            JOIN Users u ON m.TeacherId = u.Id
            JOIN Categories c ON m.CategoryId = c.Id
        `;

        if (!req.user) {
            query = `${baseQuery} WHERE m.IsPublished = 1 AND m.IsPublic = 1 ORDER BY m.CreatedAt DESC`;
        } else if (req.user.role === 'Student') {
            query = `${baseQuery} WHERE m.IsPublished = 1 ORDER BY m.CreatedAt DESC`;
        } else if (req.user.role === 'Teacher') {
            query = `${baseQuery} WHERE m.TeacherId = ${req.user.userId} OR m.IsPublished = 1 ORDER BY m.CreatedAt DESC`;
        } else {
            query = `${baseQuery} ORDER BY m.CreatedAt DESC`;
        }
        
        const result = await sql.query(query);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ message: 'Ошибка базы данных' }); }
};

exports.getMaterialById = async (req, res) => {
    try {
        const result = await sql.query`
            SELECT m.*, u.FirstName, u.LastName, u.MiddleName, c.CategoryName 
            FROM EducationalMaterials m
            JOIN Users u ON m.TeacherId = u.Id
            JOIN Categories c ON m.CategoryId = c.Id
            WHERE m.Id = ${req.params.id}
        `;
        const m = result.recordset[0];
        if (!m) return res.status(404).json({ message: 'Материал не найден' });

        m.Terms = JSON.parse(m.Terms || '[]');
        m.Quizzes = normalizeQuizzes(JSON.parse(m.Quizzes || '[]'));
        m.SelfCheck = JSON.parse(m.SelfCheck || '[]');
        m.PracticalTask = JSON.parse(m.PracticalTask || 'null');
        res.json(sanitizeMaterialContent(m));
    } catch (err) { res.status(500).json({ message: 'Ошибка загрузки' }); }
};

exports.updateMaterial = async (req, res) => {
    const { Title, Summary, Terms, Quizzes, SelfCheck, PracticalTask, IsPublic, CategoryId } = req.body;
    try {
        const materialId = parseInt(req.params.id, 10);
        if (Number.isNaN(materialId)) {
            return res.status(400).json({ message: 'Некорректный ID материала.' });
        }

        const materialResult = await sql.query`
            SELECT Id, TeacherId
            FROM EducationalMaterials
            WHERE Id = ${materialId}
        `;
        const material = materialResult.recordset[0];
        if (!material) {
            return res.status(404).json({ message: 'Материал не найден.' });
        }

        if (req.user.role === 'Teacher' && material.TeacherId !== req.user.userId) {
            return res.status(403).json({ message: 'Вы можете редактировать только свои материалы.' });
        }

        const validationError = validateMaterialPayload({ Title, Summary, Terms, Quizzes, SelfCheck, PracticalTask });
        if (validationError) {
            return res.status(400).json({ message: validationError });
        }

        const normalizedTitle = cleanText(Title || '');
        const duplicateTitleResult = await sql.query`
            SELECT TOP 1 Id
            FROM EducationalMaterials
            WHERE TeacherId = ${material.TeacherId}
              AND Title = ${normalizedTitle}
              AND Id <> ${materialId}
        `;
        if (duplicateTitleResult.recordset[0]) {
            return res.status(400).json({ message: 'У вас уже есть лекция с таким названием!' });
        }

        await sql.query`
            UPDATE EducationalMaterials 
            SET Title=${normalizedTitle}, 
                Summary=${aiService.normalizeSummaryParagraphSpacing(cleanText(Summary))}, 
                Terms=${JSON.stringify(Terms)}, 
                Quizzes=${JSON.stringify(normalizeQuizzes(Quizzes))}, 
                SelfCheck=${JSON.stringify(SelfCheck)},
                PracticalTask=${JSON.stringify(PracticalTask)}, 
                IsPublic=${IsPublic ? 1 : 0},
                CategoryId=${CategoryId},
                UpdatedAt = GETUTCDATE() 
            WHERE Id=${materialId}
        `;
        res.json({ message: 'Обновлено' });
    } catch (err) { res.status(500).json({ message: 'Ошибка обновления' }); }
};

exports.regenerateQuiz = async (req, res) => {
    const { materialId, quizIndex } = req.body;
    try {
        const result = await sql.query`SELECT Summary, Quizzes FROM EducationalMaterials WHERE Id = ${materialId}`;
        const mat = result.recordset[0];
        const quizzes = JSON.parse(mat.Quizzes);
        const existingTexts = quizzes.map(q => q.question);

        const newQuiz = await aiService.generateSingleQuiz(mat.Summary, existingTexts);
        quizzes[quizIndex] = newQuiz;

        await sql.query`UPDATE EducationalMaterials SET Quizzes = ${JSON.stringify(quizzes)} WHERE Id = ${materialId}`;
        res.json({ newQuizzes: quizzes });
    } catch (error) { res.status(500).json({ message: 'Ошибка ИИ' }); }
};

exports.publishMaterial = async (req, res) => {
    try {
        await sql.query`UPDATE EducationalMaterials SET IsPublished = 1 WHERE Id = ${req.params.id}`;
        res.json({ message: 'Опубликовано' });
    } catch (err) { res.status(500).json({ message: 'Ошибка публикации' }); }
};

exports.unpublishMaterial = async (req, res) => {
    try {
        const materialId = parseInt(req.params.id, 10);
        if (Number.isNaN(materialId)) {
            return res.status(400).json({ message: 'Некорректный ID материала.' });
        }

        const materialResult = await sql.query`
            SELECT Id, TeacherId, IsPublished
            FROM EducationalMaterials
            WHERE Id = ${materialId}
        `;
        const material = materialResult.recordset[0];
        if (!material) {
            return res.status(404).json({ message: 'Материал не найден.' });
        }
        if (!material.IsPublished) {
            return res.status(400).json({ message: 'Материал уже не опубликован.' });
        }

        if (req.user.role === 'Teacher' && material.TeacherId !== req.user.userId) {
            return res.status(403).json({
                message: 'Снять с публикации может только автор материала или администратор.',
            });
        }

        await sql.query`
            UPDATE EducationalMaterials
            SET IsPublished = 0, UpdatedAt = GETUTCDATE()
            WHERE Id = ${materialId}
        `;
        res.json({ message: 'Материал снят с публикации' });
    } catch (err) {
        console.error('unpublishMaterial', err);
        res.status(500).json({ message: 'Ошибка снятия с публикации' });
    }
};

exports.deleteMaterial = async (req, res) => {
    try {
        const materialId = parseInt(req.params.id, 10);
        if (Number.isNaN(materialId)) {
            return res.status(400).json({ message: 'Некорректный ID материала.' });
        }

        const materialResult = await sql.query`
            SELECT Id, TeacherId, IsPublished
            FROM EducationalMaterials
            WHERE Id = ${materialId}
        `;
        const material = materialResult.recordset[0];
        if (!material) {
            return res.status(404).json({ message: 'Материал не найден.' });
        }

        if (req.user.role === 'Teacher' && material.TeacherId !== req.user.userId) {
            return res.status(403).json({ message: 'Вы можете удалять только свои материалы.' });
        }

        if (req.user.role === 'Admin' && material.IsPublished) {
            return res.status(403).json({
                message: 'Администратор не может удалять опубликованные материалы. Сначала снимите материал с публикации или обратитесь к автору.',
            });
        }

        await ensureStudentProgressTable();
        await sql.query`DELETE FROM StudentMaterialProgress WHERE MaterialId = ${materialId}`;
        await sql.query`DELETE FROM EducationalMaterials WHERE Id = ${materialId}`;
        res.json({ message: 'Удалено' });
    } catch (err) {
        console.error('deleteMaterial', err);
        res.status(500).json({ message: 'Ошибка удаления: не удалось выполнить операцию в базе данных.' });
    }
};

const ensureStudentProgressTable = async () => {
    await sql.query`
        IF OBJECT_ID('dbo.StudentMaterialProgress', 'U') IS NULL
        BEGIN
            CREATE TABLE StudentMaterialProgress (
                Id INT PRIMARY KEY IDENTITY(1,1),
                StudentId INT NOT NULL FOREIGN KEY REFERENCES Users(Id),
                MaterialId INT NOT NULL FOREIGN KEY REFERENCES EducationalMaterials(Id),
                SummaryRead BIT NOT NULL DEFAULT 0,
                TermsLearned BIT NOT NULL DEFAULT 0,
                QuizCompleted BIT NOT NULL DEFAULT 0,
                LastQuizScore INT NULL,
                QuizAttempts INT NOT NULL DEFAULT 0,
                TotalQuizPercent INT NOT NULL DEFAULT 0,
                LastOpenedAt DATETIME NULL,
                UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
                CONSTRAINT UQ_StudentMaterialProgress UNIQUE (StudentId, MaterialId)
            );
        END
    `;
};

exports.getStudentProgress = async (req, res) => {
    try {
        await ensureStudentProgressTable();
        const studentId = req.user.userId;

        const progressResult = await sql.query`
            SELECT p.*
            FROM StudentMaterialProgress p
            JOIN EducationalMaterials m ON m.Id = p.MaterialId
            WHERE p.StudentId = ${studentId}
        `;

        const progressByMaterial = {};
        progressResult.recordset.forEach((row) => {
            progressByMaterial[row.MaterialId] = {
                summaryRead: !!row.SummaryRead,
                termsLearned: !!row.TermsLearned,
                quizCompleted: !!row.QuizCompleted
            };
        });

        const recentMaterialIds = progressResult.recordset
            .filter(r => r.LastOpenedAt)
            .sort((a, b) => new Date(b.LastOpenedAt) - new Date(a.LastOpenedAt))
            .slice(0, 5)
            .map(r => r.MaterialId);

        const openedMaterials = progressResult.recordset.filter(r => !!r.LastOpenedAt).length;
        const quizAttempts = progressResult.recordset.reduce((sum, r) => sum + (r.QuizAttempts || 0), 0);
        const totalQuizPercent = progressResult.recordset.reduce((sum, r) => sum + (r.TotalQuizPercent || 0), 0);

        res.json({
            progressByMaterial,
            recentMaterialIds,
            stats: {
                openedMaterials,
                quizAttempts,
                averageScore: quizAttempts > 0 ? Math.round(totalQuizPercent / quizAttempts) : 0
            }
        });
    } catch (err) {
        res.status(500).json({ message: 'Ошибка загрузки прогресса.' });
    }
};

exports.updateStudentProgress = async (req, res) => {
    try {
        await ensureStudentProgressTable();
        const studentId = req.user.userId;
        const materialId = parseInt(req.params.id, 10);
        if (Number.isNaN(materialId)) {
            return res.status(400).json({ message: 'Некорректный ID материала.' });
        }

        const {
            summaryRead,
            termsLearned,
            quizCompleted,
            quizScorePercent,
            markOpened
        } = req.body || {};

        const materialResult = await sql.query`
            SELECT Id, IsPublished
            FROM EducationalMaterials
            WHERE Id = ${materialId}
        `;
        const material = materialResult.recordset[0];
        if (!material || !material.IsPublished) {
            return res.status(404).json({ message: 'Материал не найден.' });
        }

        await sql.query`
            IF NOT EXISTS (
                SELECT 1 FROM StudentMaterialProgress WHERE StudentId = ${studentId} AND MaterialId = ${materialId}
            )
            BEGIN
                INSERT INTO StudentMaterialProgress (StudentId, MaterialId)
                VALUES (${studentId}, ${materialId})
            END
        `;

        const currentResult = await sql.query`
            SELECT *
            FROM StudentMaterialProgress
            WHERE StudentId = ${studentId} AND MaterialId = ${materialId}
        `;
        const current = currentResult.recordset[0];

        let nextSummaryRead = current.SummaryRead;
        let nextTermsLearned = current.TermsLearned;
        let nextQuizCompleted = current.QuizCompleted;
        let nextLastQuizScore = current.LastQuizScore;
        let nextQuizAttempts = current.QuizAttempts || 0;
        let nextTotalQuizPercent = current.TotalQuizPercent || 0;

        if (typeof summaryRead === 'boolean') nextSummaryRead = summaryRead ? 1 : 0;
        if (typeof termsLearned === 'boolean') nextTermsLearned = termsLearned ? 1 : 0;
        if (typeof quizCompleted === 'boolean') nextQuizCompleted = quizCompleted ? 1 : 0;

        if (Number.isInteger(quizScorePercent)) {
            const normalizedQuizScore = Math.max(0, Math.min(100, quizScorePercent));
            nextLastQuizScore = normalizedQuizScore;
            nextQuizAttempts += 1;
            nextTotalQuizPercent += normalizedQuizScore;
            nextQuizCompleted = 1;
        }

        await sql.query`
            UPDATE StudentMaterialProgress
            SET
                SummaryRead = ${nextSummaryRead},
                TermsLearned = ${nextTermsLearned},
                QuizCompleted = ${nextQuizCompleted},
                LastQuizScore = ${nextLastQuizScore},
                QuizAttempts = ${nextQuizAttempts},
                TotalQuizPercent = ${nextTotalQuizPercent},
                LastOpenedAt = ${markOpened ? new Date() : current.LastOpenedAt},
                UpdatedAt = GETUTCDATE()
            WHERE StudentId = ${studentId} AND MaterialId = ${materialId}
        `;

        res.json({ message: 'Прогресс обновлен.' });
    } catch (err) {
        res.status(500).json({ message: 'Ошибка обновления прогресса.' });
    }
};

exports.getPublicMaterialById = async (req, res) => {
    try {
        const result = await sql.query`
            SELECT m.*, u.FirstName, u.LastName, u.MiddleName, c.CategoryName 
            FROM EducationalMaterials m
            JOIN Users u ON m.TeacherId = u.Id
            JOIN Categories c ON m.CategoryId = c.Id
            WHERE m.Id = ${req.params.id} AND m.IsPublic = 1 AND m.IsPublished = 1
        `;
        const m = result.recordset[0];
        if (!m) return res.status(404).json({ message: 'Материал не найден' });

        m.Terms = JSON.parse(m.Terms || '[]');
        m.Quizzes = normalizeQuizzes(JSON.parse(m.Quizzes || '[]'));
        m.SelfCheck = JSON.parse(m.SelfCheck || '[]');
        m.PracticalTask = JSON.parse(m.PracticalTask || 'null');
        res.json(sanitizeMaterialContent(m));
    } catch (err) { res.status(500).json({ message: 'Ошибка сервера' }); }
};

exports.getCategories = async (req, res) => {
    try {
        const result = await sql.query`SELECT * FROM Categories ORDER BY CategoryName`;
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ message: 'Ошибка БД' }); }
};
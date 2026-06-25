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

const normalizeSummaryParagraphSpacing = (value) => {
    if (typeof value !== 'string' || !value) return value;
    return value.replace(/\n{3,}/g, '\n\n').trim();
};
exports.normalizeSummaryParagraphSpacing = normalizeSummaryParagraphSpacing;

const normalizeGeneratedContent = (payload) => {
    if (!payload || typeof payload !== 'object') return payload;

    return {
        ...payload,
        summary: normalizeSummaryParagraphSpacing(cleanText(payload.summary || '')),
        terms: Array.isArray(payload.terms)
            ? payload.terms.map(t => ({
                term: cleanText(t?.term || ''),
                definition: cleanText(t?.definition || '')
            })).filter(t => t.term && t.definition)
            : [],
        quizzes: Array.isArray(payload.quizzes)
            ? payload.quizzes.map(q => ({
                question: cleanText(q?.question || ''),
                options: Array.isArray(q?.options) ? q.options.map(o => cleanText(o || '')).filter(Boolean) : [],
                correctAnswerIndices: Array.isArray(q?.correctAnswerIndices)
                    ? q.correctAnswerIndices.filter(i => Number.isInteger(i) && i >= 0 && i <= 3)
                    : (Number.isInteger(q?.correctAnswerIndex) ? [q.correctAnswerIndex] : [0])
            })).filter(q => q.question && q.options.length === 4)
            : [],
        selfCheck: Array.isArray(payload.selfCheck)
            ? payload.selfCheck.map(q => cleanText(q || '')).filter(Boolean)
            : [],
        practicalTask: payload.practicalTask
            ? {
                scenario: cleanText(payload.practicalTask?.scenario || ''),
                questions: Array.isArray(payload.practicalTask?.questions)
                    ? payload.practicalTask.questions.map(q => cleanText(q || '')).filter(Boolean)
                    : []
            }
            : null
    };
};

exports.generateSingleQuiz = async (summary, existingQuestions) => {
    const configResult = await sql.query`SELECT * FROM SystemConfigs`;
    const configs = {};
    configResult.recordset.forEach(c => configs[c.ConfigKey] = c.ConfigValue);
    const stylePrompt = `${configs['SYSTEM_PROMPT'] || 'Ты — методист.'}`.trim();

    const prompt = `
        На основе этого конспекта: "${summary}"
        Сгенерируй ОДИН новый уникальный тест (вопрос и 4 варианта).
        ВАЖНО: Вопрос НЕ должен повторять эти: ${JSON.stringify(existingQuestions)}.
        Некоторые вопросы могут иметь один правильный ответ, некоторые — несколько.
        Верни СТРОГО JSON: {"question": "...", "options": ["...","...","...","..."], "correctAnswerIndices": [0]} 
        (индексы в массиве от 0 до 3).
    `;

    const response = await fetch(`${process.env.AI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.AI_API_KEY}` },
        body: JSON.stringify({
            model: configs['AI_MODEL'],
            messages: [{ role: "system", content: stylePrompt }, { role: "user", content: prompt }],
            response_format: { type: "json_object" }
        })
    });
    if (!response.ok) {
        throw new Error(`Ошибка ИИ при генерации теста: HTTP ${response.status}`);
    }

    const data = await response.json();
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content || '{}');
    return {
        question: cleanText(parsed.question || ''),
        options: Array.isArray(parsed.options) ? parsed.options.map(o => cleanText(o || '')).filter(Boolean) : [],
        correctAnswerIndices: Array.isArray(parsed.correctAnswerIndices)
            ? parsed.correctAnswerIndices.filter(i => Number.isInteger(i) && i >= 0 && i <= 3)
            : []
    };
};

exports.generateEducationalContent = async (text, params) => {
    try {
        const configResult = await sql.query`SELECT * FROM SystemConfigs`;
        const configs = {};
        configResult.recordset.forEach(c => configs[c.ConfigKey] = c.ConfigValue);

        const apiKey = process.env.AI_API_KEY;
        const baseUrl = process.env.AI_BASE_URL;
        const requiredKeys = ['AI_MODEL', 'SYSTEM_PROMPT', 'AI_TEMPERATURE', 'MAX_TOKENS'];
        const missingKeys = requiredKeys.filter(k => !configs[k] || !`${configs[k]}`.trim());
        if (missingKeys.length > 0) {
            throw new Error(`Не заполнены настройки ИИ: ${missingKeys.join(', ')}`);
        }

        const model = configs['AI_MODEL'];
        const temperature = parseFloat(configs['AI_TEMPERATURE']);
        const maxTokens = parseInt(configs['MAX_TOKENS'], 10);

        if (!apiKey) throw new Error("API ключ не найден в .env.");
        if (Number.isNaN(temperature) || temperature < 0 || temperature > 1) {
            throw new Error('Некорректная настройка AI_TEMPERATURE (ожидается число 0..1).');
        }
        if (Number.isNaN(maxTokens) || maxTokens < 500 || maxTokens > 16000) {
            throw new Error('Некорректная настройка MAX_TOKENS (ожидается целое число 500..16000).');
        }

        const charCount = text.length;
        const summaryKey = `${params.summaryLength || ''}`.trim().toLowerCase();
        const isLongSource = charCount >= 8000;
        const isVeryLongSource = charCount >= 16000;

        let minParagraphs;
        let maxParagraphs;
        let toneLabel;

        if (summaryKey === 'краткий') {
            toneLabel = 'лаконичный, но содержательный';
            if (isVeryLongSource) {
                minParagraphs = 7;
                maxParagraphs = 9;
            } else if (isLongSource) {
                minParagraphs = 6;
                maxParagraphs = 8;
            } else {
                minParagraphs = 5;
                maxParagraphs = 7;
            }
        } else if (summaryKey === 'подробный') {
            toneLabel = 'максимально развёрнутый учебный';
            if (isVeryLongSource) {
                minParagraphs = 14;
                maxParagraphs = 20;
            } else if (isLongSource) {
                minParagraphs = 13;
                maxParagraphs = 18;
            } else {
                minParagraphs = 12;
                maxParagraphs = 16;
            }
        } else {
            toneLabel = 'структурированный, сбалансированный по объёму';
            if (isVeryLongSource) {
                minParagraphs = 10;
                maxParagraphs = 14;
            } else if (isLongSource) {
                minParagraphs = 9;
                maxParagraphs = 13;
            } else {
                minParagraphs = 8;
                maxParagraphs = 11;
            }
        }

        const lengthInstruction = `
            Объём исходного текста: примерно ${charCount} знаков (без учёта страниц; длинные документы нужно раскрыть полнее).
            Поле summary: напиши ${toneLabel} конспект строго в диапазоне от ${minParagraphs} до ${maxParagraphs} абзацев.
            Разделяй абзацы в тексте конспекта двойным переводом строки (\\n\\n).
            В каждом абзаце — не меньше 4 и не более 10 полноценных предложений по сути исходника; не заполняй абзацы общими фразами.
            Для длинного исходника (${isVeryLongSource ? 'очень большой' : isLongSource ? 'большой' : 'обычный'}) сохраняй пропорции: не сжимай всё в пару абзацев, если выбран режим «краткий» — всё равно выдерживай указанное число абзацев и выделяй главные блоки темы.
            Не используй проценты и слова «кратко/средне/подробно» в самом конспекте — только содержание.
        `.replace(/\s+/g, ' ').trim();

        const systemPrompt = `
            ${configs['SYSTEM_PROMPT']}
            Твоя задача — проанализировать предоставленный текст и сформировать учебный модуль в формате JSON.
            
            ПОРЯДОК ТВОЕЙ РАБОТЫ:
            1. Сначала напиши качественный конспект (summary). Инструкция по объему: ${lengthInstruction}
            2. На основе ТОЛЬКО ЧТО НАПИСАННОГО ТОБОЙ конспекта выдели ключевые термины (terms).
            3. На основе ТОЛЬКО ЧТО НАПИСАННОГО ТОБОЙ конспекта составь ${params.quizCount} тестов (quizzes). 
            4. На основе конспекта составь вопросы для самопроверки (selfCheck).
            5. На основе конспекта подготовить ситуационную задачу (practicalTask): реалистичный сценарий (scenario) и 3 аналитических вопроса (questions).
            
            Это критически важно: студент будет видеть только твой конспект, поэтому вопросы и термины не должны касаться того, чего нет в твоем итоговом тексте.
            
            СТРОГО СОБЛЮДАЙ ФОРМАТ JSON:
            {
                "summary": "Текст конспекта с использованием \\n\\n для разделения абзацев...",
                "terms": [{"term": "Слово", "definition": "Определение из конспекта"}],
                "quizzes": [
                    {
                        "question": "Вопрос по конспекту?",
                        "options": ["вариант 1", "вариант 2", "вариант 3", "вариант 4"],
                        "correctAnswerIndices": [0]
                    }
                ],
                "selfCheck": ["Вопрос 1", "Вопрос 2"],
                "practicalTask": {"scenario": "...", "questions": ["...", "...", "..."]}
            }
        `;

        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
            body: JSON.stringify({
                model,
                messages: [
                    { role: "system", content: systemPrompt }, 
                    { role: "user", content: `Исходный текст для обработки (объем ${charCount} симв.):\n\n${text}` }
                ],
                temperature,
                max_tokens: maxTokens,
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            throw new Error(`Ошибка ИИ: HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.error) {
            console.error('--- API ОШИБКА ---', data.error);
            throw new Error(`Ошибка нейросети: ${data.error.message}`);
        }

        const aiContent = data?.choices?.[0]?.message?.content;
        if (!aiContent || typeof aiContent !== 'string') {
            throw new Error('ИИ не вернул контент в ожидаемом формате.');
        }

        let aiText = aiContent.replace(/```json/g, '').replace(/```/g, '').trim();
        
        try {
            const parsed = JSON.parse(aiText);
            return normalizeGeneratedContent(parsed);
        } catch (e) {
            console.error('--- ОШИБКА ПАРСИНГА JSON ---', aiText);
            throw new Error("ИИ вернул ответ в некорректном формате.");
        }

    } catch (error) {
        console.error('AI SERVICE ERROR:', error.message);
        throw new Error(error.message || 'Ошибка связи с ИИ.');
    }
};
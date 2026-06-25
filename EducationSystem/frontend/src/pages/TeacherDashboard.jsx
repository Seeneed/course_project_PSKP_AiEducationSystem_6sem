import React, { useState, useEffect, useContext } from 'react';
import { FiAlertCircle, FiCheckCircle, FiRefreshCw } from 'react-icons/fi';
import { AuthContext } from '../context/AuthContext';
import api from '../api/axios';
import { notify } from '../utils/notify';
import ConfirmDialog from '../components/ConfirmDialog';

const Flashcard = ({ term, definition }) => {
    const [isFlipped, setIsFlipped] = useState(false);
    return (
        <div className={`flashcard ${isFlipped ? 'flipped' : ''}`} onClick={() => setIsFlipped(!isFlipped)}>
            <div className="flashcard-inner flashcard-front">
                <span>{term}</span>
                <div style={{ position: 'absolute', bottom: '15px', fontSize: '12px', color: '#7f8c8d', fontWeight: 'normal' }}>
                    <i className="fas fa-sync-alt" style={{ marginRight: '5px' }}></i> Нажмите, чтобы перевернуть
                </div>
            </div>
            <div className="flashcard-inner flashcard-back">{definition}</div>
        </div>
    );
};

const TeacherDashboard = () => {
    const { user } = useContext(AuthContext);
    const [materials, setMaterials] = useState([]);
    const [dbCategories, setDbCategories] = useState([]);
    const [editMode, setEditMode] = useState(null);
    const [viewMode, setViewMode] = useState(null);
    const [file, setFile] = useState(null);
    const [fileKey, setFileKey] = useState(Date.now());
    const [title, setTitle] = useState('');
    const [loading, setLoading] = useState(false);
    const [regenLoading, setRegenLoading] = useState(null);

    const [search, setSearch] = useState('');
    const [filterCat, setFilterCat] = useState('Все');
    const [materialTab, setMaterialTab] = useState('mine');
    const [sortBy, setSortBy] = useState('created_desc');
    const [settings, setSettings] = useState({ summaryLength: 'средний', quizCount: '3', category: '' });
    const [quizAnswers, setQuizAnswers] = useState({});
    const [quizChecked, setQuizChecked] = useState(false);
    const [quizScore, setQuizScore] = useState(null);
    const [uploadFeedback, setUploadFeedback] = useState({ type: '', text: '' });
    const LS_KEY = 'teacher_dashboard_materials_state_v1';
    const [isStateHydrated, setIsStateHydrated] = useState(false);
    const [generationStatus, setGenerationStatus] = useState({
        isReady: false,
        hasCategories: false,
        missingConfigs: [],
        categoriesCount: 0
    });
    const [confirmDialog, setConfirmDialog] = useState(null);
    const [generationStatusLoaded, setGenerationStatusLoaded] = useState(false);

    const formatDate = (isoString) => {
        if (!isoString) return '—';
        const date = new Date(isoString.endsWith('Z') ? isoString : `${isoString}Z`);
        return date.toLocaleDateString('ru-RU');
    };
    const hasMaterialUpdate = (material) => {
        if (!material?.UpdatedAt || !material?.CreatedAt) return false;
        return Math.abs(new Date(material.UpdatedAt) - new Date(material.CreatedAt)) > 60000;
    };

    const titleRegex = /^[a-zA-Zа-яА-ЯёЁ0-9\s\-.,:()!?«»"']+$/;

    const getQuizCountLimits = (summaryLength) => {
        const key = `${summaryLength || ''}`.trim().toLowerCase();
        if (key === 'краткий') return { min: 3, max: 5, hint: 'кратком конспекте' };
        if (key === 'подробный') return { min: 3, max: 15, hint: 'подробном конспекте' };
        return { min: 3, max: 8, hint: 'среднем объёме конспекта' };
    };

    useEffect(() => {
        if (!uploadFeedback.text) return;
        const delay = uploadFeedback.type === 'error' ? 10000 : 4000;
        const timer = setTimeout(() => setUploadFeedback({ type: '', text: '' }), delay);
        return () => clearTimeout(timer);
    }, [uploadFeedback]);

    useEffect(() => {
        fetchList();
        loadCategories();
        loadGenerationStatus();
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return;
            const persisted = JSON.parse(raw);
            if (typeof persisted.search === 'string') setSearch(persisted.search);
            if (typeof persisted.filterCat === 'string') setFilterCat(persisted.filterCat);
            if (typeof persisted.materialTab === 'string') setMaterialTab(persisted.materialTab);
            if (typeof persisted.sortBy === 'string') setSortBy(persisted.sortBy);
        } catch (_) {}
        setIsStateHydrated(true);
    }, []);

    useEffect(() => {
        if (!isStateHydrated) return;
        try {
            localStorage.setItem(LS_KEY, JSON.stringify({ search, filterCat, materialTab, sortBy }));
        } catch (_) {}
    }, [search, filterCat, materialTab, sortBy, isStateHydrated]);

    useEffect(() => {
        const handleGoHome = () => {
            setViewMode(null);
            setEditMode(null);
            setQuizAnswers({});
            setQuizChecked(false);
            setQuizScore(null);
        };
        window.addEventListener('dashboard:go-home', handleGoHome);
        return () => window.removeEventListener('dashboard:go-home', handleGoHome);
    }, []);

    const fetchList = async () => {
        try {
            const res = await api.get('/content');
            setMaterials(res.data);
        } catch (_) {
            notify.error('Не удалось загрузить материалы');
        }
    };

    const loadGenerationStatus = async () => {
        try {
            const res = await api.get('/content/generation/status');
            setGenerationStatus(res.data);
        } catch (_) {
        } finally {
            setGenerationStatusLoaded(true);
        }
    };

    const loadCategories = async () => {
        try {
            const res = await api.get('/content/categories');
            setDbCategories(res.data);
            if (res.data.length > 0) setSettings(prev => ({ ...prev, category: res.data[0].Id }));
        } catch (_) {
            notify.error('Не удалось загрузить категории');
        }
    };

    const clearFile = () => {
        setFile(null);
        setFileKey(Date.now());
        setUploadFeedback({ type: '', text: '' });
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        const count = parseInt(settings.quizCount, 10);
        const normalizedTitle = title.trim();
        const { min, max, hint } = getQuizCountLimits(settings.summaryLength);
        if (Number.isNaN(count) || count < min || count > max) {
            return setUploadFeedback({
                type: 'error',
                text: `Для ${hint} допустимо от ${min} до ${max} вопросов. При большем числе часть вопросов может не опираться на сжатый конспект.`,
            });
        }
        if (normalizedTitle.length < 5 || normalizedTitle.length > 120) {
            return setUploadFeedback({ type: 'error', text: 'Название темы должно содержать от 5 до 120 символов.' });
        }
        if (!titleRegex.test(normalizedTitle)) {
            return setUploadFeedback({ type: 'error', text: 'Название содержит недопустимые символы.' });
        }
        if (!file) {
            return setUploadFeedback({ type: 'error', text: 'Сначала выберите PDF или DOCX файл.' });
        }
        if (file.size === 0) {
            return setUploadFeedback({
                type: 'error',
                text: 'Выбранный файл пустой (0 байт). Укажите другой документ.',
            });
        }

        setLoading(true);
        setUploadFeedback({ type: '', text: '' });
        const formData = new FormData();
        formData.append('document', file);
        formData.append('title', normalizedTitle);
        formData.append('category', settings.category);
        formData.append('summaryLength', settings.summaryLength);
        formData.append('quizCount', count);
        try {
            await api.post('/content/generate', formData);
            await fetchList();
            setTitle('');
            clearFile();
            setUploadFeedback({ type: 'success', text: 'Материал успешно сгенерирован.' });
            notify.success('Материал успешно сгенерирован');
        } catch (e) {
            const message = e.response?.data?.message || 'Ошибка генерации';
            setUploadFeedback({ type: 'error', text: message });
        } finally {
            setLoading(false);
        }
    };

    const handleRegenerateQuiz = async (index) => {
        setRegenLoading(index);
        try {
            const res = await api.post('/content/regenerate-quiz', { materialId: editMode.Id, quizIndex: index });
            setEditMode({ ...editMode, Quizzes: res.data.newQuizzes });
            notify.success('Вопрос успешно обновлен');
        } catch (_) {
            notify.error('Ошибка связи с ИИ');
        } finally {
            setRegenLoading(null);
        }
    };

    const handleExport = (m) => {
        const termsText = m?.Terms?.map(t => `${t.term} - ${t.definition}`).join('\n') || 'Нет данных';
        const selfCheckText = m?.SelfCheck?.join('\n') || 'Нет данных';
        const practicalQuestionsText = m?.PracticalTask?.questions?.join('\n') || 'Нет данных';

        const text = `МАТЕРИАЛ: ${m.Title}
КАТЕГОРИЯ: ${m.CategoryName}
АВТОР: ${m.LastName} ${m.FirstName} ${m.MiddleName || ''}
ДОБАВЛЕН: ${formatDate(m.CreatedAt)}
ИЗМЕНЕН: ${formatDate(m.UpdatedAt)}

КОНСПЕКТ:
${m.Summary || 'Нет данных'}

ТЕРМИНЫ:
${termsText}

ВОПРОСЫ ДЛЯ САМОПРОВЕРКИ:
${selfCheckText}

СИТУАЦИОННАЯ ЗАДАЧА:
${m?.PracticalTask?.scenario || 'Нет данных'}

ВОПРОСЫ К СИТУАЦИОННОЙ ЗАДАЧЕ:
${practicalQuestionsText}`;
        const blob = new Blob([text], { type: 'text/plain; charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${m.Title}.txt`;
        link.click();
    };

    const deleteMat = async (id) => {
        try {
            await api.delete(`/content/${id}`);
            await fetchList();
            notify.success('Материал удален');
        } catch (e) {
            notify.error(e.response?.data?.message || 'Ошибка удаления материала');
        }
    };

    const handleTermChange = (index, field, value) => {
        const newTerms = [...editMode.Terms];
        newTerms[index][field] = value;
        setEditMode({ ...editMode, Terms: newTerms });
    };

    const checkIsCorrect = (q, optionIndex) => {
        return Array.isArray(q.correctAnswerIndices) && q.correctAnswerIndices.includes(optionIndex);
    };

    const sortMaterials = (list) => {
        const sorted = [...list];
        switch (sortBy) {
            case 'created_desc': sorted.sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt)); break;
            case 'created_asc': sorted.sort((a, b) => new Date(a.CreatedAt) - new Date(b.CreatedAt)); break;
            case 'updated_desc': sorted.sort((a, b) => new Date(b.UpdatedAt) - new Date(a.UpdatedAt)); break;
            case 'updated_asc': sorted.sort((a, b) => new Date(a.UpdatedAt) - new Date(b.UpdatedAt)); break;
            case 'title_asc': sorted.sort((a, b) => a.Title.localeCompare(b.Title, 'ru')); break;
            case 'title_desc': sorted.sort((a, b) => b.Title.localeCompare(a.Title, 'ru')); break;
            default: break;
        }
        return sorted;
    };

    const scopedMaterials = materials.filter(m => (
        materialTab === 'mine' ? m.TeacherId === user?.userId : m.TeacherId !== user?.userId
    ));

    const filteredMaterials = scopedMaterials.filter(m => {
        const authorFullName = `${m.LastName} ${m.FirstName} ${m.MiddleName || ''}`.toLowerCase();
        const matchesSearch = m.Title.toLowerCase().includes(search.toLowerCase()) || authorFullName.includes(search.toLowerCase());
        const matchesCat = filterCat === 'Все' || m.CategoryName === filterCat;
        return matchesSearch && matchesCat;
    });
    const sortedMaterials = sortMaterials(filteredMaterials);

    if (viewMode) return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px' }}>
                <button className="btn-outline" onClick={() => setViewMode(null)}>← Назад</button>
                <button className="btn-green" onClick={() => handleExport(viewMode)}>Экспорт</button>
            </div>
            <h1 className="lecture-title">{viewMode.Title}</h1>
            <p style={{ color: '#666', fontSize: '14px', marginTop: '-15px' }}>
                Категория: <strong>{viewMode.CategoryName}</strong> | Автор: {viewMode.LastName} {viewMode.FirstName} {viewMode.MiddleName}
            </p>
            <p style={{ color: '#7a7a7a', fontSize: '13px', marginTop: '-10px' }}>
                Добавлено: {formatDate(viewMode.CreatedAt)}
                {hasMaterialUpdate(viewMode) && ` | Изменено: ${formatDate(viewMode.UpdatedAt)}`}
            </p>
            <div className="section"><h3>Конспект</h3><div style={{ whiteSpace: 'pre-line' }}>{viewMode.Summary}</div></div>
            <div className="section">
                <h3>Словарь терминов</h3>
                <div className="flashcard-grid">{viewMode.Terms?.map((t, i) => <Flashcard key={i} term={t.term} definition={t.definition} />)}</div>
            </div>
            {viewMode.Quizzes?.length > 0 && (
                <div className="section">
                    <h3>Тестирование</h3>
                    {viewMode.Quizzes.map((q, i) => (
                        <div key={i} style={{ marginBottom: '20px', padding: '15px', background: '#fdfdfd', borderRadius: '8px', border: '1px solid #eee' }}>
                            <p style={{ fontWeight: '600' }}>{i + 1}. {q.question}</p>
                            <ul style={{marginTop: '10px', listStyle:'none', paddingLeft: 0}}>
                                {q.options.map((opt, oi) => {
                                    const isOwner = viewMode.TeacherId === user?.userId || user?.role === 'Admin';
                                    const selectedOptions = Array.isArray(quizAnswers[i]) ? quizAnswers[i] : [];
                                    const isPicked = selectedOptions.includes(oi);
                                    const isCorrect = checkIsCorrect(q, oi);
                                    const showCorrect = isOwner || quizChecked;
                                    return (
                                        <li key={oi} onClick={() => {
                                            if (isOwner || quizChecked) return;
                                            setQuizAnswers(prev => {
                                                const current = Array.isArray(prev[i]) ? prev[i] : [];
                                                const next = current.includes(oi)
                                                    ? current.filter(x => x !== oi)
                                                    : [...current, oi];
                                                return { ...prev, [i]: next };
                                            });
                                        }}
                                            style={{
                                                padding: '8px', borderRadius: '4px', marginBottom: '4px',
                                                cursor: !isOwner && !quizChecked ? 'pointer' : 'default',
                                                background: showCorrect && isCorrect ? '#d4edda' : (isPicked ? '#eef3ff' : 'transparent'),
                                                color: showCorrect && isCorrect ? '#155724' : 'inherit',
                                                border: showCorrect && isCorrect ? '1px solid #c3e6cb' : '1px solid #eee'
                                            }}>
                                            {opt} {showCorrect && isCorrect && <b>(Правильный ответ)</b>}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                    {!(viewMode.TeacherId === user?.userId || user?.role === 'Admin') && (
                        !quizChecked ? (
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                    className="btn-green"
                                    onClick={() => {
                                        let correct = 0;
                                        viewMode.Quizzes.forEach((q, i) => {
                                            const selected = Array.isArray(quizAnswers[i]) ? [...quizAnswers[i]].sort((a, b) => a - b) : [];
                                            const expected = Array.isArray(q.correctAnswerIndices) ? [...q.correctAnswerIndices].sort((a, b) => a - b) : [];
                                            if (selected.length === expected.length && selected.every((v, idx) => v === expected[idx])) correct++;
                                        });
                                        setQuizScore(`Ваш результат: ${correct} из ${viewMode.Quizzes.length}`);
                                        setQuizChecked(true);
                                    }}
                                    disabled={viewMode.Quizzes.some((_, i) => !Array.isArray(quizAnswers[i]) || quizAnswers[i].length === 0)}
                                >
                                    Проверить тест
                                </button>
                                <button className="btn-outline" onClick={() => setQuizAnswers({})}>
                                    Сбросить выбор
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <strong>{quizScore}</strong>
                                <button className="btn-outline" onClick={() => { setQuizAnswers({}); setQuizChecked(false); setQuizScore(null); }}>
                                    Пройти заново
                                </button>
                            </div>
                        )
                    )}
                </div>
            )}
            {viewMode.PracticalTask && (
                <div className="section">
                    <h3>Ситуационная задача</h3>
                    <p><i>{viewMode.PracticalTask.scenario}</i></p>
                    <ul>{viewMode.PracticalTask.questions?.map((q, i) => <li key={i}>{q}</li>)}</ul>
                </div>
            )}
            {viewMode.SelfCheck?.length > 0 && (
                <div className="section">
                    <h3>Вопросы для самопроверки</h3>
                    <ul style={{ paddingLeft: '20px', lineHeight: '1.8' }}>{viewMode.SelfCheck.map((q, i) => <li key={i}>{q}</li>)}</ul>
                </div>
            )}
            <div style={{ marginTop: '24px' }}>
                <button className="btn-outline" onClick={() => setViewMode(null)}>
                    ← Назад
                </button>
            </div>
        </div>
    );

    if (editMode) return (
        <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '25px' }}>
                <button className="btn-outline" onClick={() => setEditMode(null)} style={{ padding: '5px 12px' }}>← Назад</button>
                <h2 style={{ margin: 0 }}>Правка учебного контента</h2>
            </div>
            <div style={{ marginBottom: '15px', fontSize: '13px', color: '#666', background: '#f8f9fa', border: '1px solid #e9ecef', borderRadius: '8px', padding: '10px 12px' }}>
                Добавлено: <strong>{formatDate(editMode.CreatedAt)}</strong>
                {hasMaterialUpdate(editMode) && <> | Изменено: <strong>{formatDate(editMode.UpdatedAt)}</strong></>}
            </div>
            
            <label>Заголовок лекции</label>
            <input value={editMode.Title} onChange={e => setEditMode({ ...editMode, Title: e.target.value })} />
            
            <label>Категория знаний</label>
            <select value={editMode.CategoryId} onChange={e => setEditMode({ ...editMode, CategoryId: e.target.value })}>
                {dbCategories.map(c => <option key={c.Id} value={c.Id}>{c.CategoryName}</option>)}
            </select>
            
            <label>Конспект</label>
            <textarea style={{ height: '250px' }} value={editMode.Summary} onChange={e => setEditMode({ ...editMode, Summary: e.target.value })} />

            <hr style={{ margin: '30px 0', opacity: 0.5 }} />
            <label>Словарь терминов</label>
            {editMode.Terms && editMode.Terms.length > 0 ? (
                <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    {editMode.Terms.map((t, index) => (
                        <div key={index} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                            <input style={{ flex: '1', fontWeight: 'bold' }} value={t.term} onChange={e => handleTermChange(index, 'term', e.target.value)} />
                            <input style={{ flex: '3' }} value={t.definition} onChange={e => handleTermChange(index, 'definition', e.target.value)} />
                        </div>
                    ))}
                </div>
            ) : <p style={{ fontSize: '14px', color: '#888' }}>Термины отсутствуют.</p>}

            <label style={{ marginTop: '20px' }}>Вопросы для самопроверки</label>
            <textarea style={{ height: '100px' }} value={editMode.SelfCheck ? editMode.SelfCheck.join('\n') : ''}
                onChange={e => setEditMode({ ...editMode, SelfCheck: e.target.value.split('\n') })} />

            <label style={{ marginTop: '20px' }}>Ситуационная задача</label>
            <textarea
                style={{ height: '130px' }}
                value={editMode.PracticalTask?.scenario || ''}
                onChange={e => setEditMode({
                    ...editMode,
                    PracticalTask: { ...(editMode.PracticalTask || { questions: [] }), scenario: e.target.value }
                })}
            />

            <label style={{ marginTop: '20px' }}>Вопросы к ситуационной задаче</label>
            <textarea
                style={{ height: '100px' }}
                value={editMode.PracticalTask?.questions ? editMode.PracticalTask.questions.join('\n') : ''}
                onChange={e => setEditMode({
                    ...editMode,
                    PracticalTask: {
                        ...(editMode.PracticalTask || { scenario: '' }),
                        questions: e.target.value.split('\n')
                    }
                })}
            />
            
            <hr style={{ margin: '30px 0', opacity: 0.5 }} />
            <h3>Тесты и регенерация</h3>
            <p style={{ fontSize: '12px', color: '#666', marginTop: 0 }}>* Вы можете вопросы сгенерировать по новой.</p>
            {editMode.Quizzes?.map((q, i) => (
                <div key={i} style={{ background: '#fcfdff', padding: '16px', marginBottom: '16px', borderRadius: '10px', border: '1px solid #e6edf7', boxShadow: '0 2px 10px rgba(12, 62, 115, 0.05)' }}>
                    <p style={{margin: 0, fontWeight: 'bold', lineHeight: 1.45}}>{i + 1}. {q.question}</p>
                    <ul style={{marginTop: '12px', listStyle:'none', paddingLeft: 0, display: 'grid', gap: '6px'}}>
                        {q.options.map((opt, oi) => {
                            const isCorrect = checkIsCorrect(q, oi);
                            return (
                                <li key={oi} style={{ 
                                    padding: '8px 10px',
                                    background: isCorrect ? '#d4edda' : 'transparent',
                                    color: isCorrect ? '#155724' : 'inherit',
                                    borderRadius: '6px',
                                    border: isCorrect ? '1px solid #c3e6cb' : '1px solid #e9ecef'
                                }}>
                                    {opt} {isCorrect && <b>(Правильный ответ)</b>}
                                </li>
                            );
                        })}
                    </ul>
                    <button 
                        className="btn-outline" 
                        style={{marginTop: '10px', fontSize:'12px'}} 
                        disabled={regenLoading === i}
                        onClick={() => handleRegenerateQuiz(i)}
                    >
                        {regenLoading === i ? 'Генерация...' : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                <FiRefreshCw size={14} />
                                Заменить этот вопрос
                            </span>
                        )}
                    </button>
                </div>
            ))}

            <div style={{ margin: '25px 0', display: 'flex', alignItems: 'center', gap: '10px', background: '#e7f1ff', padding: '10px 15px', borderRadius: '6px' }}>
                <input type="checkbox" id="isGuest" checked={editMode.IsPublic} onChange={e => setEditMode({ ...editMode, IsPublic: e.target.checked })} style={{ width: 'auto', transform: 'scale(1.2)' }} />
                <label htmlFor="isGuest" style={{ margin: 0, cursor: 'pointer', color: 'var(--blue)' }}>Сделать доступным для гостей</label>
            </div>

            <div style={{ display: 'flex', gap: '15px' }}>
                        <button className="btn-green" onClick={async () => {
                            try {
                                await api.put(`/content/${editMode.Id}`, editMode);
                                const refreshed = await api.get(`/content/${editMode.Id}`);
                                setEditMode(refreshed.data);
                                await fetchList();
                                notify.success('Изменения сохранены');
                            } catch (e) {
                                notify.error(e.response?.data?.message || 'Ошибка сохранения');
                            }
                        }}>Сохранить изменения</button>
                <button className="btn-outline" onClick={() => setEditMode(null)}>Назад</button>
            </div>
        </div>
    );

    return (
        <div>
            <div className="card">
                <h3>Загрузка новых материалов</h3>
                {!generationStatusLoaded ? (
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', borderRadius: '8px', padding: '10px 12px', fontSize: '13px' }}>
                        Проверка конфигурации генерации...
                    </div>
                ) : !generationStatus.isReady ? (
                    <div style={{ display: 'grid', gap: '10px' }}>
                        {!generationStatus.hasCategories && (
                            <div style={{ background: '#fff4e5', border: '1px solid #ffd8a8', color: '#8a5b00', borderRadius: '8px', padding: '10px 12px', fontSize: '13px' }}>
                                Категории не настроены администратором. Генерация временно недоступна.
                            </div>
                        )}
                        {generationStatus.missingConfigs?.length > 0 && (
                            <div style={{ background: '#fff4e5', border: '1px solid #ffd8a8', color: '#8a5b00', borderRadius: '8px', padding: '10px 12px', fontSize: '13px' }}>
                                Не заполнены настройки ИИ: <strong>{generationStatus.missingConfigs.join(', ')}</strong>. Обратитесь к администратору.
                            </div>
                        )}
                    </div>
                ) : (
                    <form onSubmit={handleUpload} noValidate>
                        <input
                            placeholder="Введите название темы"
                            value={title}
                            maxLength={120}
                            onChange={e => {
                                setTitle(e.target.value);
                                if (uploadFeedback.text) setUploadFeedback({ type: '', text: '' });
                            }}
                        />

                        <div style={{ display: 'flex', gap: '20px', marginBottom: '15px', marginTop: '15px' }}>
                            <div style={{ flex: 1 }}>
                                <label>Категория знаний</label>
                                <select
                                    value={settings.category}
                                    onChange={e => {
                                        setSettings({ ...settings, category: e.target.value });
                                        if (uploadFeedback.text) setUploadFeedback({ type: '', text: '' });
                                    }}
                                >
                                    {dbCategories.map(c => <option key={c.Id} value={c.Id}>{c.CategoryName}</option>)}
                                </select>
                            </div>
                            <div style={{ flex: 1 }}>
                                <label>Объем конспекта</label>
                                <select onChange={e => {
                                    setSettings({ ...settings, summaryLength: e.target.value });
                                    if (uploadFeedback.text) setUploadFeedback({ type: '', text: '' });
                                }}>
                                    <option value="средний">Средний</option>
                                    <option value="краткий">Краткий</option>
                                    <option value="подробный">Подробный</option>
                                </select>
                            </div>
                            <div style={{ flex: 1 }}>
                                <label>Кол-во вопросов</label>
                                <input
                                    type="number"
                                    min={getQuizCountLimits(settings.summaryLength).min}
                                    max={getQuizCountLimits(settings.summaryLength).max}
                                    value={settings.quizCount}
                                    onChange={e => {
                                        setSettings({ ...settings, quizCount: e.target.value });
                                        if (uploadFeedback.text) setUploadFeedback({ type: '', text: '' });
                                    }}
                                />
                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                                    При выбранном объёме конспекта: от {getQuizCountLimits(settings.summaryLength).min} до{' '}
                                    {getQuizCountLimits(settings.summaryLength).max} вопросов (тест строится по конспекту).
                                </div>
                            </div>
                        </div>

                        <label>Выберите PDF или DOCX</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                            <input
                                key={fileKey}
                                type="file"
                                accept=".pdf,.docx"
                                onChange={e => {
                                    setFile(e.target.files[0]);
                                    if (uploadFeedback.text) setUploadFeedback({ type: '', text: '' });
                                }}
                                style={{ margin: 0 }}
                            />
                            {file && <button type="button" className="btn-red" onClick={clearFile} style={{ padding: '5px 10px', fontSize: '12px' }}>Очистить выбор</button>}
                        </div>
                        <button
                            disabled={loading}
                            style={{ width: '100%', padding: '12px', fontSize: '16px' }}
                        >
                            {loading ? 'ИИ анализирует документ...' : 'Сгенерировать учебный материал'}
                        </button>
                        {uploadFeedback.text && (
                            <div
                                className={`form-feedback-panel ${uploadFeedback.type === 'error' ? 'error' : 'success'}`}
                                role={uploadFeedback.type === 'error' ? 'alert' : 'status'}
                                aria-live={uploadFeedback.type === 'error' ? 'assertive' : 'polite'}
                            >
                                {uploadFeedback.type === 'error' ? (
                                    <FiAlertCircle className="form-feedback-icon" size={18} aria-hidden />
                                ) : (
                                    <FiCheckCircle className="form-feedback-icon" size={18} aria-hidden />
                                )}
                                <span>{uploadFeedback.text}</span>
                            </div>
                        )}
                    </form>
                )}
            </div>

            <div style={{ display: 'flex', gap: '20px', marginBottom: '25px', alignItems: 'flex-end' }}>
                <div style={{ flex: 2 }}>
                    <label>Поиск по названию или автору</label>
                    <input placeholder="Введите название темы или ФИО автора..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                    <label>Фильтр категории</label>
                    <select value={filterCat} onChange={e => setFilterCat(e.target.value)}>
                        <option value="Все">Все категории</option>
                        {dbCategories.map(c => <option key={c.Id} value={c.CategoryName}>{c.CategoryName}</option>)}
                    </select>
                </div>
                <div style={{ flex: 1 }}>
                    <label>Сортировка</label>
                    <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
                        <option value="created_desc">Сначала новые</option>
                        <option value="created_asc">Сначала старые</option>
                        <option value="updated_desc">Недавно обновленные</option>
                        <option value="updated_asc">Давно не обновлялись</option>
                        <option value="title_asc">По названию (А-Я)</option>
                        <option value="title_desc">По названию (Я-А)</option>
                    </select>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <button className={materialTab === 'mine' ? 'btn-green' : 'btn-outline'} onClick={() => setMaterialTab('mine')}>
                    Мои материалы
                </button>
                <button className={materialTab === 'others' ? 'btn-green' : 'btn-outline'} onClick={() => setMaterialTab('others')}>
                    Материалы других преподавателей
                </button>
            </div>

            <h3>Управление материалами</h3>
            <div className="grid">
                {sortedMaterials.length > 0 ? (
                    sortedMaterials.map(m => {
                        const isOwner = m.TeacherId === user?.userId || user?.role === 'Admin';
                        return (
                            <div key={m.Id} className="card-item material-card material-card-teacher">
                                <div className="material-card-header">
                                    <span className="badge material-card-badge-cat">{m.CategoryName}</span>
                                    <span className={`badge ${m.IsPublished ? 'badge-pub' : 'badge-draft'}`}>{m.IsPublished ? 'Опубликован' : 'Черновик'}</span>
                                </div>
                                <h4 className="material-card-title" title={m.Title}>{m.Title}</h4>
                                <p className="material-card-author" title={`${m.LastName} ${m.FirstName} ${m.MiddleName || ''}`}>
                                    Автор: {m.LastName} {m.FirstName[0]}.{m.MiddleName ? m.MiddleName[0] + '.' : ''}
                                </p>
                                <div className="material-card-meta">
                                    <div className="material-card-meta-row">Добавлено: {formatDate(m.CreatedAt)}</div>
                                    {hasMaterialUpdate(m) ? (
                                        <div className="material-card-meta-row">Изменено: {formatDate(m.UpdatedAt)}</div>
                                    ) : (
                                        <div className="material-card-meta-row material-card-meta-row--reserved" aria-hidden="true" />
                                    )}
                                </div>
                                <div className="material-card-actions">
                                    <button className="btn-outline" onClick={async () => {
                                        try {
                                            const res = await api.get(`/content/${m.Id}`);
                                            setQuizAnswers({});
                                            setQuizChecked(false);
                                            setQuizScore(null);
                                            setViewMode(res.data);
                                        } catch (_) {
                                            notify.error('Не удалось открыть материал');
                                        }
                                    }}>Просмотр</button>
                                    {isOwner && (
                                        <>
                                            <button className="btn-outline" onClick={async () => {
                                                try {
                                                    const res = await api.get(`/content/${m.Id}`);
                                                    setEditMode(res.data);
                                                } catch (_) {
                                                    notify.error('Не удалось открыть материал для редактирования');
                                                }
                                            }}>Правка</button>
                                            {!m.IsPublished && <button className="btn-green" onClick={async () => {
                                                try {
                                                    await api.put(`/content/${m.Id}/publish`);
                                                    await fetchList();
                                                    notify.success('Материал опубликован');
                                                } catch (e) {
                                                    notify.error(e.response?.data?.message || 'Ошибка публикации');
                                                }
                                            }}>Опубликовать</button>}
                                            {m.IsPublished && (
                                                <button
                                                    className="btn-outline"
                                                    onClick={() =>
                                                        setConfirmDialog({
                                                            title: 'Снять материал с публикации?',
                                                            message:
                                                                'Студенты перестанут видеть его в каталоге до повторной публикации.',
                                                            confirmText: 'Снять с публикации',
                                                            danger: false,
                                                            onConfirm: async () => {
                                                                try {
                                                                    await api.put(`/content/${m.Id}/unpublish`);
                                                                    await fetchList();
                                                                    notify.success('Материал снят с публикации');
                                                                } catch (e) {
                                                                    notify.error(
                                                                        e.response?.data?.message || 'Ошибка снятия с публикации'
                                                                    );
                                                                }
                                                            },
                                                        })
                                                    }
                                                >
                                                    Снять с публикации
                                                </button>
                                            )}
                                            <button
                                                className="btn-red"
                                                onClick={() =>
                                                    setConfirmDialog({
                                                        title: 'Удалить материал?',
                                                        message: `Тема «${m.Title}» будет удалена без возможности восстановления.`,
                                                        confirmText: 'Удалить',
                                                        danger: true,
                                                        onConfirm: async () => {
                                                            await deleteMat(m.Id);
                                                        },
                                                    })
                                                }
                                            >
                                                Удалить
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', background: '#fff', borderRadius: '8px', border: '1px dashed #ccc', color: '#888' }}>
                        <h4 style={{ margin: 0 }}>Учебных материалов пока нет</h4>
                        <p style={{ fontSize: '14px', marginTop: '10px' }}>
                            {materialTab === 'mine'
                                ? 'Попробуйте изменить параметры поиска или создайте новую лекцию выше.'
                                : 'Пока нет опубликованных материалов других преподавателей по выбранным фильтрам.'}
                        </p>
                    </div>
                )}
            </div>

            <ConfirmDialog
                open={!!confirmDialog}
                title={confirmDialog?.title ?? ''}
                message={confirmDialog?.message ?? ''}
                confirmText={confirmDialog?.confirmText}
                cancelText={confirmDialog?.cancelText}
                danger={confirmDialog?.danger}
                onConfirm={confirmDialog?.onConfirm}
                onClose={() => setConfirmDialog(null)}
            />
        </div>
    );
};

export default TeacherDashboard;
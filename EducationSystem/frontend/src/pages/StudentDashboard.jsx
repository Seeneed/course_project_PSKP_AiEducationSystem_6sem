import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { FiAlertCircle, FiCheckCircle } from 'react-icons/fi';

const Flashcard = ({ term, definition }) => {
    const [isFlipped, setIsFlipped] = useState(false);
    return (
        <div className={`flashcard ${isFlipped ? 'flipped' : ''}`} onClick={() => setIsFlipped(!isFlipped)}>
            <div className="flashcard-inner flashcard-front">
                <span>{term}</span>
                <div style={{ position: 'absolute', bottom: '15px', fontSize: '12px', color: '#7f8c8d', fontWeight: 'normal' }}>
                    <i className="fas fa-sync-alt" style={{ marginRight: '5px' }}></i> Нажми, чтобы перевернуть
                </div>
            </div>
            <div className="flashcard-inner flashcard-back">
                <strong style={{ marginBottom: '10px', display: 'block', borderBottom: '1px solid rgba(255,255,255,0.3)', paddingBottom: '5px' }}>
                    {term}
                </strong>
                {definition}
            </div>
        </div>
    );
};

const StudentDashboard = () => {
    const [materials, setMaterials] = useState([]);
    const [categories, setCategories] = useState([]);
    const [selected, setSelected] = useState(null);
    const [search, setSearch] = useState('');
    const [filterCat, setFilterCat] = useState('Все');
    const [sortBy, setSortBy] = useState('created_desc');
    const LS_KEY = 'student_dashboard_materials_state_v1';
    const [isStateHydrated, setIsStateHydrated] = useState(false);

    const [answers, setAnswers] = useState({});
    const [score, setScore] = useState(null);
    const [isChecked, setIsChecked] = useState(false);
    const [feedback, setFeedback] = useState({ type: '', text: '' });
    const [materialProgress, setMaterialProgress] = useState({});
    const [learningStats, setLearningStats] = useState({ openedMaterials: 0, quizAttempts: 0, averageScore: 0 });
    const [recentMaterialIds, setRecentMaterialIds] = useState([]);

    useEffect(() => {
        if (!feedback.text) return;
        const timer = setTimeout(() => setFeedback({ type: '', text: '' }), 4000);
        return () => clearTimeout(timer);
    }, [feedback]);

    useEffect(() => { 
        fetchMaterials(); 
        fetchStudentProgress();
        api.get('/content/categories')
            .then(res => setCategories(res.data))
            .catch(() => setFeedback({ type: 'error', text: 'Не удалось загрузить категории' }));
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return;
            const persisted = JSON.parse(raw);
            if (typeof persisted.search === 'string') setSearch(persisted.search);
            if (typeof persisted.filterCat === 'string') setFilterCat(persisted.filterCat);
            if (typeof persisted.sortBy === 'string') setSortBy(persisted.sortBy);
        } catch (_) {}
        setIsStateHydrated(true);
    }, []);

    useEffect(() => {
        if (!isStateHydrated) return;
        try {
            localStorage.setItem(LS_KEY, JSON.stringify({ search, filterCat, sortBy }));
        } catch (_) {}
    }, [search, filterCat, sortBy, isStateHydrated]);

    useEffect(() => {
        const handleGoHome = () => {
            setSelected(null);
            setAnswers({});
            setScore(null);
            setIsChecked(false);
        };
        window.addEventListener('dashboard:go-home', handleGoHome);
        return () => window.removeEventListener('dashboard:go-home', handleGoHome);
    }, []);

    const fetchMaterials = async () => {
        try {
            const res = await api.get('/content');
            setMaterials(res.data);
        } catch (_) {
            setFeedback({ type: 'error', text: 'Не удалось загрузить материалы' });
        }
    };

    const fetchStudentProgress = async () => {
        try {
            const res = await api.get('/content/progress');
            setMaterialProgress(res.data?.progressByMaterial || {});
            setRecentMaterialIds(res.data?.recentMaterialIds || []);
            setLearningStats(res.data?.stats || { openedMaterials: 0, quizAttempts: 0, averageScore: 0 });
        } catch (_) {
            setFeedback({ type: 'error', text: 'Не удалось загрузить прогресс обучения' });
        }
    };

    const updateProgress = async (materialId, payload, optimisticUpdater) => {
        if (optimisticUpdater) optimisticUpdater();
        try {
            await api.put(`/content/${materialId}/progress`, payload);
            await fetchStudentProgress();
        } catch (_) {
            setFeedback({ type: 'error', text: 'Не удалось сохранить прогресс' });
            await fetchStudentProgress();
        }
    };

    const handleExport = () => {
        if (!selected) return;
        const termsText = selected?.Terms?.map(t => `${t.term} - ${t.definition}`).join('\n') || 'Нет данных';
        const selfCheckText = selected?.SelfCheck?.join('\n') || 'Нет данных';
        const practicalQuestionsText = selected?.PracticalTask?.questions?.join('\n') || 'Нет данных';

        const text = `МАТЕРИАЛ: ${selected.Title}
КАТЕГОРИЯ: ${selected.CategoryName}
АВТОР: ${selected.LastName} ${selected.FirstName} ${selected.MiddleName}

КОНСПЕКТ:
${selected.Summary || 'Нет данных'}

ТЕРМИНЫ:
${termsText}

ВОПРОСЫ ДЛЯ САМОПРОВЕРКИ:
${selfCheckText}

СИТУАЦИОННАЯ ЗАДАЧА:
${selected?.PracticalTask?.scenario || 'Нет данных'}

ВОПРОСЫ К СИТУАЦИОННОЙ ЗАДАЧЕ:
${practicalQuestionsText}`;

        const blob = new Blob([text], { type: 'text/plain; charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${selected.Title}.txt`;
        link.click();
    };

    const checkQuiz = () => {
        if (selected?.Quizzes?.some((_, i) => !Array.isArray(answers[i]) || answers[i].length === 0)) {
            setFeedback({ type: 'error', text: 'Выберите варианты ответа для всех вопросов.' });
            return;
        }
        let correct = 0;
        selected.Quizzes.forEach((q, i) => {
            const selectedIndices = Array.isArray(answers[i]) ? [...answers[i]].sort((a, b) => a - b) : [];
            const correctIndices = Array.isArray(q.correctAnswerIndices) ? [...q.correctAnswerIndices].sort((a, b) => a - b) : [];
            if (selectedIndices.length === correctIndices.length && selectedIndices.every((v, idx) => v === correctIndices[idx])) correct++;
        });
        setScore(`Ваш результат: ${correct} из ${selected.Quizzes.length}`);
        setIsChecked(true);
        const percent = Math.round((correct / selected.Quizzes.length) * 100);
        if (selected?.Id) {
            updateProgress(selected.Id, { quizCompleted: true, quizScorePercent: percent }, () => {
                setMaterialProgress(prev => ({
                    ...prev,
                    [selected.Id]: {
                        summaryRead: !!prev[selected.Id]?.summaryRead,
                        termsLearned: !!prev[selected.Id]?.termsLearned,
                        quizCompleted: true
                    }
                }));
            });
        }
    };

    const resetQuiz = () => { setAnswers({}); setScore(null); setIsChecked(false); };
    const formatDate = (isoString) => {
        if (!isoString) return '—';
        const date = new Date(isoString.endsWith('Z') ? isoString : `${isoString}Z`);
        return date.toLocaleDateString('ru-RU');
    };

    const hasMaterialUpdate = (material) => {
        if (!material?.UpdatedAt || !material?.CreatedAt) return false;
        return Math.abs(new Date(material.UpdatedAt) - new Date(material.CreatedAt)) > 60000;
    };

    const getOptionClass = (qIdx, oIdx, quiz) => {
        const cIdxs = Array.isArray(quiz?.correctAnswerIndices) ? quiz.correctAnswerIndices : [];
        const selected = Array.isArray(answers[qIdx]) ? answers[qIdx] : [];
        let className = "quiz-option ";
        if (!isChecked) { if (selected.includes(oIdx)) className += "active "; return className; }
        className += "disabled ";
        if (cIdxs.includes(oIdx)) className += "correct ";
        else if (selected.includes(oIdx)) className += "wrong ";
        return className;
    };

    const filtered = materials.filter(m => {
        const authorFullName = `${m.LastName} ${m.FirstName} ${m.MiddleName || ''}`.toLowerCase();
        const matchesSearch = m.Title.toLowerCase().includes(search.toLowerCase()) || authorFullName.includes(search.toLowerCase());
        const matchesCat = filterCat === 'Все' || m.CategoryName === filterCat;
        return matchesSearch && matchesCat;
    });
    const sorted = [...filtered].sort((a, b) => {
        switch (sortBy) {
            case 'created_desc': return new Date(b.CreatedAt) - new Date(a.CreatedAt);
            case 'created_asc': return new Date(a.CreatedAt) - new Date(b.CreatedAt);
            case 'updated_desc': return new Date(b.UpdatedAt) - new Date(a.UpdatedAt);
            case 'updated_asc': return new Date(a.UpdatedAt) - new Date(b.UpdatedAt);
            case 'title_asc': return a.Title.localeCompare(b.Title, 'ru');
            case 'title_desc': return b.Title.localeCompare(a.Title, 'ru');
            default: return 0;
        }
    });

    const openMaterial = async (materialId) => {
        try {
            setFeedback({ type: '', text: '' });
            resetQuiz();
            const res = await api.get(`/content/${materialId}`);
            const opened = res.data;
            setSelected(opened);
            updateProgress(opened.Id, { markOpened: true });
        } catch (e) {
            setFeedback({ type: 'error', text: e.response?.data?.message || 'Не удалось открыть материал' });
        }
    };
    const continueMaterial = materials.find(m => m.Id === recentMaterialIds[0]);
    const selectedProgress = selected?.Id
        ? (materialProgress[selected.Id] || { summaryRead: false, termsLearned: false, quizCompleted: false })
        : { summaryRead: false, termsLearned: false, quizCompleted: false };
    const completedProgressSteps = [selectedProgress.summaryRead, selectedProgress.termsLearned, selectedProgress.quizCompleted].filter(Boolean).length;

    const FeedbackPanel = ({ type, text }) => (
        <div
            className={`form-feedback-panel ${type === 'error' ? 'error' : 'success'}`}
            role={type === 'error' ? 'alert' : 'status'}
            aria-live={type === 'error' ? 'assertive' : 'polite'}
        >
            {type === 'error' ? (
                <FiAlertCircle className="form-feedback-icon" size={18} aria-hidden />
            ) : (
                <FiCheckCircle className="form-feedback-icon" size={18} aria-hidden />
            )}
            <span>{text}</span>
        </div>
    );

    if (selected) return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px' }}>
                <button className="btn-outline" onClick={() => { setSelected(null); resetQuiz(); }}>← Назад</button>
                <button className="btn-green" onClick={handleExport}>Экспорт материала</button>
            </div>
            {feedback.text && <FeedbackPanel type={feedback.type} text={feedback.text} />}
            <h1 className="lecture-title">{selected.Title}</h1>
            <p style={{color: '#666', fontSize: '15px', marginTop: '-15px'}}>Категория: <strong>{selected.CategoryName}</strong> | Автор: {selected.LastName} {selected.FirstName} {selected.MiddleName}</p>

            <div className="section"><h3>Конспект</h3><div style={{ whiteSpace: 'pre-line', fontSize: '16px', color: '#333' }}>{selected.Summary}</div></div>
            <div className="section" style={{ background: '#f8fafc' }}>
                <h3>Ваш прогресс по материалу</h3>
                <div style={{ display: 'grid', gap: '10px' }}>
                    <label style={{ marginTop: 0 }}>
                        <input
                            type="checkbox"
                            checked={selectedProgress.summaryRead}
                            onChange={(e) => updateProgress(selected.Id, { summaryRead: e.target.checked }, () => {
                                setMaterialProgress(prev => ({
                                    ...prev,
                                    [selected.Id]: { ...selectedProgress, summaryRead: e.target.checked }
                                }));
                            })}
                            style={{ marginRight: '8px' }}
                        />
                        Конспект прочитан
                    </label>
                    <label style={{ marginTop: 0 }}>
                        <input
                            type="checkbox"
                            checked={selectedProgress.termsLearned}
                            onChange={(e) => updateProgress(selected.Id, { termsLearned: e.target.checked }, () => {
                                setMaterialProgress(prev => ({
                                    ...prev,
                                    [selected.Id]: { ...selectedProgress, termsLearned: e.target.checked }
                                }));
                            })}
                            style={{ marginRight: '8px' }}
                        />
                        Термины изучены
                    </label>
                    <label style={{ marginTop: 0 }}>
                        <input
                            type="checkbox"
                            checked={selectedProgress.quizCompleted}
                            onChange={(e) => updateProgress(selected.Id, { quizCompleted: e.target.checked }, () => {
                                setMaterialProgress(prev => ({
                                    ...prev,
                                    [selected.Id]: { ...selectedProgress, quizCompleted: e.target.checked }
                                }));
                            })}
                            style={{ marginRight: '8px' }}
                        />
                        Тест пройден
                    </label>
                    <div style={{ fontSize: '14px', color: '#475569' }}>Выполнено шагов: <strong>{completedProgressSteps} из 3</strong></div>
                </div>
            </div>

            {selected.Terms?.length > 0 && (
                <div className="section">
                    <h3>Тренажер терминов</h3>
                    <div className="flashcard-grid">{selected.Terms.map((t, i) => <Flashcard key={i} term={t.term} definition={t.definition} />)}</div>
                </div>
            )}

            {selected.Quizzes?.length > 0 && (
                <div className="section">
                    <h3>Тестирование</h3>
                    {selected.Quizzes.map((q, i) => (
                        <div key={i} style={{ marginBottom: '25px', padding: '20px', background: '#fcfcfc', borderRadius: '8px', border: '1px solid #eee' }}>
                            <p style={{ fontWeight: '600' }}>{i + 1}. {q.question}</p>
                            {q.options.map((opt, oi) => (
                                <div key={oi} className={getOptionClass(i, oi, q)} onClick={() => {
                                    if (isChecked) return;
                                    setAnswers(prev => {
                                        const current = Array.isArray(prev[i]) ? prev[i] : [];
                                        const next = current.includes(oi)
                                            ? current.filter(x => x !== oi)
                                            : [...current, oi];
                                        return { ...prev, [i]: next };
                                    });
                                }}>{opt}</div>
                            ))}
                        </div>
                    ))}
                    {!isChecked ? <button className="btn-green" onClick={checkQuiz} disabled={selected.Quizzes.some((_, i) => !Array.isArray(answers[i]) || answers[i].length === 0)}>Проверить</button> :
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', background: '#f8f9fa', padding: '15px', borderRadius: '8px' }}>
                            <div style={{fontSize:'18px', fontWeight:'bold'}}>{score}</div><button className="btn-outline" onClick={resetQuiz}>Заново</button>
                        </div>
                    }
                </div>
            )}

            {selected.PracticalTask && (
                <div className="section">
                    <h3>Ситуационная задача</h3>
                    <p><i>{selected.PracticalTask.scenario}</i></p>
                    <ul>{selected.PracticalTask.questions?.map((q, i) => <li key={i}>{q}</li>)}</ul>
                </div>
            )}

            {selected.SelfCheck?.length > 0 && (
                <div className="section"><h3>Вопросы для самопроверки</h3><ul style={{ paddingLeft: '20px', lineHeight: '1.8' }}>{selected.SelfCheck.map((q, i) => <li key={i}>{q}</li>)}</ul></div>
            )}
            <div style={{ marginTop: '24px' }}>
                <button className="btn-outline" onClick={() => { setSelected(null); resetQuiz(); }}>
                    ← Назад
                </button>
            </div>
        </div>
    );

    return (
        <div>
            <div className="card" style={{ marginBottom: '16px' }}>
                <h3 style={{ marginTop: 0, marginBottom: '12px' }}>Продолжить обучение</h3>
                {continueMaterial ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ color: '#475569' }}>
                            Последний материал: <strong>{continueMaterial.Title}</strong> ({continueMaterial.CategoryName})
                        </div>
                        <button className="btn-green" onClick={() => openMaterial(continueMaterial.Id)}>Продолжить</button>
                    </div>
                ) : (
                    <div style={{ color: '#64748b' }}>Пока нет открытых материалов. Выберите лекцию из списка ниже.</div>
                )}
            </div>

            <div className="card" style={{ marginBottom: '16px' }}>
                <h3 style={{ marginTop: 0, marginBottom: '12px' }}>Мини-статистика</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                    <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        Открыто материалов: <strong>{learningStats.openedMaterials || 0}</strong>
                    </div>
                    <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        Попыток тестов: <strong>{learningStats.quizAttempts || 0}</strong>
                    </div>
                    <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        Средний результат: <strong>{learningStats.averageScore || 0}%</strong>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '20px', marginBottom: '30px', alignItems: 'center' }}>
                <input
                    placeholder="Введите название темы или ФИО автора..."
                    style={{ flex: 2, margin: 0 }}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <select style={{ flex: 1, margin: 0 }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
                    <option value="Все">Все категории</option>
                    {categories.map(c => <option key={c.Id} value={c.CategoryName}>{c.CategoryName}</option>)}
                </select>
                <select style={{ flex: 1, margin: 0 }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
                    <option value="created_desc">Сначала новые</option>
                    <option value="created_asc">Сначала старые</option>
                    <option value="updated_desc">Недавно обновленные</option>
                    <option value="updated_asc">Давно не обновлялись</option>
                    <option value="title_asc">По названию (А-Я)</option>
                    <option value="title_desc">По названию (Я-А)</option>
                </select>
            </div>
            <div className="grid">
                {sorted.length > 0 ? (
                    sorted.map(m => (
                        <div key={m.Id} className="card-item material-card material-card-student">
                            <div className="material-card-header">
                                <span className="badge material-card-badge-cat">{m.CategoryName}</span>
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
                            <button
                                type="button"
                                className="material-card-actions"
                                onClick={() => openMaterial(m.Id)}
                            >
                                Открыть
                            </button>
                        </div>
                    ))
                ) : (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', background: '#fff', border: '1px dashed #ccc', color: '#888' }}>
                        <h4>Лекций не найдено</h4>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StudentDashboard;
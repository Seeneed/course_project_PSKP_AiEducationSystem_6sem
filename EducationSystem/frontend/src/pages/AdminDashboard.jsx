import React, { useState, useEffect, useContext } from 'react';
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

const AdminDashboard = () => {
    const { user } = useContext(AuthContext); 
    const [users, setUsers] = useState([]);
    const [materials, setMaterials] = useState([]); 
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState(null); 
    const [activeTab, setActiveTab] = useState('ai');

    const [matSearch, setMatSearch] = useState('');
    const [matFilterCat, setMatFilterCat] = useState('Все');
    const [matSortBy, setMatSortBy] = useState('created_desc');
    const [newCategoryName, setNewCategoryName] = useState('');
    const [categorySearch, setCategorySearch] = useState('');
    const [categoryUsageFilter, setCategoryUsageFilter] = useState('all');
    const [categorySortBy, setCategorySortBy] = useState('name_asc');
    const [editingCategoryId, setEditingCategoryId] = useState(null);
    const [editingCategoryName, setEditingCategoryName] = useState('');
    const [userSearch, setUserSearch] = useState('');
    const [userRoleFilter, setUserRoleFilter] = useState('all');
    const [userSortBy, setUserSortBy] = useState('fio_asc');
    const LS_KEY = 'admin_dashboard_materials_state_v1';
    const [isMatStateHydrated, setIsMatStateHydrated] = useState(false);

    const [localSettings, setLocalSettings] = useState({
        AI_MODEL: '', SYSTEM_PROMPT: '', AI_TEMPERATURE: '', MAX_TOKENS: ''
    });

    const [availableModels, setAvailableModels] = useState([]);
    const [confirmDialog, setConfirmDialog] = useState(null);
    const actionBtnStyle = { minWidth: '104px', minHeight: '36px', padding: '8px 12px', fontSize: '12px' };

    const formatDate = (isoString) => {
        if (!isoString) return '—';
        const date = new Date(isoString.endsWith('Z') ? isoString : `${isoString}Z`);
        return date.toLocaleDateString('ru-RU');
    };

const hasMaterialUpdate = (material) => {
    if (!material?.UpdatedAt || !material?.CreatedAt) return false;
    return Math.abs(new Date(material.UpdatedAt) - new Date(material.CreatedAt)) > 60000;
};

    const promptPresets = [
        { id: 'Ты — профессиональный образовательный ИИ-ассистент. Твоя задача — создавать качественные учебные материалы.', name: 'Стандартный ассистент' },
        { id: 'Ты — строгий академический профессор. Твои конспекты глубокие, а тесты требуют серьезных знаний.', name: 'Академический стиль' },
        { id: 'Ты — современный ментор. Объясняешь сложные вещи максимально простым и понятным языком.', name: 'Дружелюбный наставник' }
    ];

    useEffect(() => {
        fetchData();
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (raw) {
                const persisted = JSON.parse(raw);
                if (typeof persisted.matSearch === 'string') setMatSearch(persisted.matSearch);
                if (typeof persisted.matFilterCat === 'string') setMatFilterCat(persisted.matFilterCat);
                if (typeof persisted.matSortBy === 'string') setMatSortBy(persisted.matSortBy);
            }
        } catch (_) {}
        setIsMatStateHydrated(true);
    }, []);

    useEffect(() => {
        if (!isMatStateHydrated) return;
        try {
            localStorage.setItem(LS_KEY, JSON.stringify({ matSearch, matFilterCat, matSortBy }));
        } catch (_) {}
    }, [matSearch, matFilterCat, matSortBy, isMatStateHydrated]);

    useEffect(() => {
        const handleGoHome = () => {
            setViewMode(null);
            setActiveTab('materials');
        };
        window.addEventListener('dashboard:go-home', handleGoHome);
        return () => window.removeEventListener('dashboard:go-home', handleGoHome);
    }, []);

    const fetchData = async () => {
        try {
            const [uRes, cRes, mRes, modelsRes, categoryRes] = await Promise.all([
                api.get('/admin/users'),
                api.get('/admin/configs'),
                api.get('/content'),
                api.get('/admin/ai-models'),
                api.get('/admin/categories')
            ]);

            setUsers(uRes.data);
            setMaterials(mRes.data);
            setAvailableModels(modelsRes.data);
            setCategories(categoryRes.data);

            const dbSettings = {};
            cRes.data.forEach(c => { dbSettings[c.ConfigKey] = c.ConfigValue; });
            setLocalSettings(dbSettings);
            setLoading(false);
        } catch (err) { console.error('Ошибка загрузки данных'); }
    };

    const translateRole = (role) => {
        switch(role) {
            case 'Student': return 'Студент';
            case 'Teacher': return 'Учитель';
            case 'Admin': return 'Администратор';
            default: return role;
        }
    };

    const handleSettingChange = (key, value) => { setLocalSettings(prev => ({ ...prev, [key]: value })); };

    const handleSaveAISettings = async () => {
        const temp = parseFloat(localSettings.AI_TEMPERATURE);
        if (isNaN(temp) || temp < 0 || temp > 1) return notify.error('Температура: 0 - 1');
        const tokens = parseInt(localSettings.MAX_TOKENS);
        if (isNaN(tokens) || tokens < 500 || tokens > 16000) return notify.error('Токены: 500 - 16000');

        try {
            const promises = Object.entries(localSettings).map(([key, value]) =>
                api.put('/admin/configs', { key, value: value.toString() })
            );
            await Promise.all(promises);
            notify.success('Настройки сохранены');
            fetchData();
        } catch (e) { notify.error('Ошибка сохранения'); }
    };

    const handleRoleChange = async (userId, newRoleId) => {
        try {
            await api.put('/admin/users/role', { userId, newRoleId });
            notify.success('Роль обновлена');
            fetchData();
        } catch (err) { notify.error('Ошибка смены роли'); }
    };

    const handleToggleBlock = async (userId, currentStatus) => {
        try {
            await api.put('/admin/users/block', { userId, isBlocked: !currentStatus });
            fetchData();
        } catch (err) { notify.error(err?.response?.data?.message || 'Ошибка блокировки'); }
    };

    const handleDeleteUser = async (targetUser) => {
        try {
            await api.delete(`/admin/users/${targetUser.Id}`);
            notify.success('Пользователь удален');
            fetchData();
        } catch (err) {
            notify.error(err?.response?.data?.message || 'Ошибка удаления пользователя');
        }
    };

    const handleAddCategory = async () => {
        const name = newCategoryName.trim();
        if (!name) return notify.error('Введите название категории');

        try {
            await api.post('/admin/categories', { name });
            setNewCategoryName('');
            notify.success('Категория добавлена');
            fetchData();
        } catch (err) {
            notify.error(err?.response?.data?.message || 'Ошибка добавления категории');
        }
    };

    const handleDeleteCategory = async (category) => {
        try {
            await api.delete(`/admin/categories/${category.Id}`);
            notify.success('Категория удалена');
            if (editingCategoryId === category.Id) {
                setEditingCategoryId(null);
                setEditingCategoryName('');
            }
            fetchData();
        } catch (err) {
            notify.error(err?.response?.data?.message || 'Ошибка удаления категории');
        }
    };

    const startCategoryEdit = (category) => {
        setEditingCategoryId(category.Id);
        setEditingCategoryName(category.CategoryName);
    };

    const cancelCategoryEdit = () => {
        setEditingCategoryId(null);
        setEditingCategoryName('');
    };

    const saveCategoryEdit = async () => {
        const name = editingCategoryName.trim();
        if (!name) return notify.error('Введите название категории');

        try {
            await api.put(`/admin/categories/${editingCategoryId}`, { name });
            notify.success('Категория обновлена');
            setEditingCategoryId(null);
            setEditingCategoryName('');
            fetchData();
        } catch (err) {
            notify.error(err?.response?.data?.message || 'Ошибка обновления категории');
        }
    };

    const handleDeleteMaterial = async (id) => {
        try {
            await api.delete(`/content/${id}`);
            notify.success('Материал удален');
            fetchData();
        } catch (err) {
            notify.error(err?.response?.data?.message || 'Ошибка удаления материала');
        }
    };

    const handleUnpublishMaterial = async (id) => {
        try {
            await api.put(`/content/${id}/unpublish`);
            notify.success('Материал снят с публикации');
            fetchData();
        } catch (err) {
            notify.error(err?.response?.data?.message || 'Ошибка снятия с публикации');
        }
    };

    const filteredMaterials = materials.filter(m => {
        const author = `${m.LastName} ${m.FirstName} ${m.MiddleName || ''}`.toLowerCase();
        const matchesSearch = m.Title.toLowerCase().includes(matSearch.toLowerCase()) || author.includes(matSearch.toLowerCase());
        const matchesCat = matFilterCat === 'Все' || m.CategoryName === matFilterCat;
        return matchesSearch && matchesCat;
    });
    const sortedMaterials = [...filteredMaterials].sort((a, b) => {
        switch (matSortBy) {
            case 'created_desc': return new Date(b.CreatedAt) - new Date(a.CreatedAt);
            case 'created_asc': return new Date(a.CreatedAt) - new Date(b.CreatedAt);
            case 'updated_desc': return new Date(b.UpdatedAt) - new Date(a.UpdatedAt);
            case 'updated_asc': return new Date(a.UpdatedAt) - new Date(b.UpdatedAt);
            case 'title_asc': return a.Title.localeCompare(b.Title, 'ru');
            case 'title_desc': return b.Title.localeCompare(a.Title, 'ru');
            default: return 0;
        }
    });

    const categoriesWithUsage = categories.map((category) => {
        const materialsCount = materials.filter((m) => m.CategoryId === category.Id).length;
        return { ...category, materialsCount };
    });

    const filteredCategories = categoriesWithUsage.filter((category) => {
        const matchesSearch = category.CategoryName.toLowerCase().includes(categorySearch.toLowerCase());
        const matchesUsage =
            categoryUsageFilter === 'all' ||
            (categoryUsageFilter === 'used' && category.materialsCount > 0) ||
            (categoryUsageFilter === 'unused' && category.materialsCount === 0);
        return matchesSearch && matchesUsage;
    });

    const sortedCategories = [...filteredCategories].sort((a, b) => {
        switch (categorySortBy) {
            case 'name_desc': return b.CategoryName.localeCompare(a.CategoryName, 'ru');
            case 'usage_desc': return b.materialsCount - a.materialsCount;
            case 'usage_asc': return a.materialsCount - b.materialsCount;
            case 'name_asc':
            default:
                return a.CategoryName.localeCompare(b.CategoryName, 'ru');
        }
    });

    const filteredUsers = users.filter((u) => {
        const fio = `${u.LastName} ${u.FirstName} ${u.MiddleName || ''}`.toLowerCase();
        const login = `${u.Username || ''}`.toLowerCase();
        const matchesSearch = fio.includes(userSearch.toLowerCase()) || login.includes(userSearch.toLowerCase());
        const matchesRole = userRoleFilter === 'all' || u.RoleName === userRoleFilter;
        return matchesSearch && matchesRole;
    });

    const sortedUsers = [...filteredUsers].sort((a, b) => {
        const fioA = `${a.LastName} ${a.FirstName} ${a.MiddleName || ''}`;
        const fioB = `${b.LastName} ${b.FirstName} ${b.MiddleName || ''}`;
        switch (userSortBy) {
            case 'fio_desc': return fioB.localeCompare(fioA, 'ru');
            case 'fio_asc':
            default:
                return fioA.localeCompare(fioB, 'ru');
        }
    });

    if (loading) {
        return (
            <div className="container" style={{ padding: '36px 20px', textAlign: 'center', fontSize: '18px', fontWeight: 600, color: '#334155' }}>
                Загрузка панели...
            </div>
        );
    }

    if (viewMode) return (
        <div className="card">
            <button className="btn-outline" onClick={() => setViewMode(null)}>← Назад</button>
            <h1 className="lecture-title" style={{marginTop:'20px'}}>{viewMode.Title}</h1>
            <p style={{color:'#666', marginTop:'-15px'}}>Категория: {viewMode.CategoryName} | Автор: {viewMode.LastName} {viewMode.FirstName} {viewMode.MiddleName}</p>
            
            <div className="section"><h3>Конспект</h3><div style={{whiteSpace: 'pre-line'}}>{viewMode.Summary}</div></div>

            {viewMode.Terms?.length > 0 && (
                <div className="section">
                    <h3>Термины</h3>
                    <div className="flashcard-grid">{viewMode.Terms.map((t, i) => <Flashcard key={i} term={t.term} definition={t.definition} />)}</div>
                </div>
            )}

            {viewMode.Quizzes?.length > 0 && (
                <div className="section">
                    <h3>Тестирование</h3>
                    {viewMode.Quizzes.map((q, i) => (
                        <div key={i} style={{ marginBottom: '15px', padding: '15px', background: '#fdfdfd', borderRadius: '8px', border:'1px solid #eee' }}>
                            <strong>{i + 1}. {q.question}</strong>
                            <ul style={{marginTop: '10px', listStyle:'none', paddingLeft: 0}}>
                                {q.options.map((opt, oi) => (
                                    <li key={oi} style={{ padding: '8px', borderRadius: '4px', marginBottom: '4px', background: q.correctAnswerIndices?.includes(oi) ? '#d4edda' : 'transparent', color: q.correctAnswerIndices?.includes(oi) ? '#155724' : 'inherit', border: q.correctAnswerIndices?.includes(oi) ? '1px solid #c3e6cb' : '1px solid #eee' }}>
                                        {opt} {q.correctAnswerIndices?.includes(oi) && <b>(Правильный ответ)</b>}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
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
                    <ul style={{paddingLeft: '20px'}}>{viewMode.SelfCheck.map((q, i) => <li key={i}>{q}</li>)}</ul>
                </div>
            )}
            <div style={{ marginTop: '24px' }}>
                <button className="btn-outline" onClick={() => setViewMode(null)}>
                    ← Назад
                </button>
            </div>
        </div>
    );

    return (
        <div>
            <h1>Центр управления системой</h1>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <button className={activeTab === 'ai' ? 'btn-green' : 'btn-outline'} onClick={() => setActiveTab('ai')}>Настройки ИИ</button>
                <button className={activeTab === 'users' ? 'btn-green' : 'btn-outline'} onClick={() => setActiveTab('users')}>Пользователи</button>
                <button className={activeTab === 'categories' ? 'btn-green' : 'btn-outline'} onClick={() => setActiveTab('categories')}>Категории</button>
                <button className={activeTab === 'materials' ? 'btn-green' : 'btn-outline'} onClick={() => setActiveTab('materials')}>Материалы</button>
            </div>

            {activeTab === 'ai' && (
            <div className="card">
                <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Конфигурация AI-моделей</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div>
                        <label><strong>Модель нейросети</strong></label>
                        <select value={localSettings.AI_MODEL} onChange={(e) => handleSettingChange('AI_MODEL', e.target.value)}>
                            {!availableModels.find(m => m.id === localSettings.AI_MODEL) && <option value={localSettings.AI_MODEL} disabled>{localSettings.AI_MODEL} (ОТКЛЮЧЕНА!)</option>}
                            {availableModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label><strong>Стиль обучения</strong></label>
                        <select value={localSettings.SYSTEM_PROMPT} onChange={(e) => handleSettingChange('SYSTEM_PROMPT', e.target.value)}>
                            {promptPresets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label><strong>Температура</strong></label>
                        <input type="number" step="0.1" value={localSettings.AI_TEMPERATURE} onChange={(e) => handleSettingChange('AI_TEMPERATURE', e.target.value)} />
                    </div>
                    <div>
                        <label><strong>Длина ответа (Токены)</strong></label>
                        <input type="number" step="100" value={localSettings.MAX_TOKENS} onChange={(e) => handleSettingChange('MAX_TOKENS', e.target.value)} />
                    </div>
                </div>
                <button className="btn-green" onClick={handleSaveAISettings} style={{ marginTop: '20px' }}>Сохранить настройки ИИ</button>
            </div>
            )}

            {activeTab === 'users' && (
            <div className="card">
                <h3 style={{ marginTop: 0 }}>Управление учетными записями</h3>
                <div className="admin-toolbar">
                    <input
                        placeholder="Введите ФИО или логин пользователя..."
                        style={{ flex: 2, margin: 0 }}
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                    />
                    <select style={{ flex: 1, margin: 0 }} value={userRoleFilter} onChange={(e) => setUserRoleFilter(e.target.value)}>
                        <option value="all">Все роли</option>
                        <option value="Student">Студенты</option>
                        <option value="Teacher">Преподаватели</option>
                        <option value="Admin">Администраторы</option>
                    </select>
                    <select style={{ flex: 1, margin: 0 }} value={userSortBy} onChange={(e) => setUserSortBy(e.target.value)}>
                        <option value="fio_asc">ФИО (А-Я)</option>
                        <option value="fio_desc">ФИО (Я-А)</option>
                    </select>
                </div>
                <table style={{ marginTop: '10px' }}>
                    <thead><tr><th>ФИО Пользователя</th><th>Логин</th><th>Роль</th><th>Изменить роль</th><th className="th-action">Действие</th></tr></thead>
                    <tbody>
                        {sortedUsers.length > 0 ? sortedUsers.map(u => {
                            const isMe = u.Id === user?.userId;
                            const isDisabled = isMe; 

                            return (
                                <tr key={u.Id} style={{ background: u.IsBlocked ? '#fff0f0' : 'transparent', opacity: isDisabled ? 0.7 : 1 }}>
                                    <td>
                                        {u.LastName} {u.FirstName} {u.MiddleName}
                                        {isMe && <span style={{ color: 'var(--blue)', fontWeight: 'bold', marginLeft: '5px' }}>(Вы)</span>}
                                    </td>
                                    <td>{u.Username}</td>
                                    <td><span className="badge badge-pub">{translateRole(u.RoleName)}</span></td>
                                    <td className="td-action">
                                        <select defaultValue={u.RoleId} onChange={(e) => handleRoleChange(u.Id, e.target.value)} disabled={isDisabled} style={{ margin: 0, minWidth: '130px' }}>
                                            <option value="1">Студент</option>
                                            <option value="2">Учитель</option>
                                            <option value="3">Администратор</option>
                                        </select>
                                    </td>
                                    <td className="td-action">
                                        <div className="table-actions no-wrap">
                                            <button className={u.IsBlocked ? 'btn-green' : 'btn-red'} onClick={() => handleToggleBlock(u.Id, u.IsBlocked)} disabled={isDisabled} style={actionBtnStyle}>
                                                {u.IsBlocked ? 'Разблокировать' : 'Заблокировать'}
                                            </button>
                                            <button
                                                className="btn-red"
                                                onClick={() =>
                                                    !isDisabled &&
                                                    setConfirmDialog({
                                                        title: 'Удалить пользователя?',
                                                        message: `Пользователь «${u.Username}» будет удалён без возможности восстановления.`,
                                                        confirmText: 'Удалить',
                                                        danger: true,
                                                        onConfirm: async () => {
                                                            await handleDeleteUser(u);
                                                        },
                                                    })
                                                }
                                                disabled={isDisabled}
                                                style={actionBtnStyle}
                                            >
                                                Удалить
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        }) : (
                            <tr>
                                <td colSpan={5} style={{ padding: '18px 10px' }}>
                                    <div style={{ textAlign: 'center', padding: '20px', background: '#fff', borderRadius: '8px', border: '1px dashed #ccc', color: '#888' }}>
                                        Пользователи не найдены. Измените параметры поиска или фильтра.
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            )}

            {activeTab === 'categories' && (
            <div className="card">
                <h3 style={{ marginTop: 0 }}>Управление категориями</h3>
                <div className="admin-toolbar">
                    <input
                        placeholder="Новая категория"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        style={{ margin: 0, flex: 1 }}
                    />
                    <button className="btn-green" onClick={handleAddCategory} style={actionBtnStyle}>Добавить</button>
                </div>
                <div className="admin-toolbar" style={{ marginTop: '10px' }}>
                    <input
                        placeholder="Введите название категории..."
                        value={categorySearch}
                        onChange={(e) => setCategorySearch(e.target.value)}
                        style={{ margin: 0, flex: 1 }}
                    />
                    <select style={{ flex: 1, margin: 0 }} value={categoryUsageFilter} onChange={(e) => setCategoryUsageFilter(e.target.value)}>
                        <option value="all">Все категории</option>
                        <option value="used">Только используемые</option>
                        <option value="unused">Только неиспользуемые</option>
                    </select>
                    <select style={{ flex: 1, margin: 0 }} value={categorySortBy} onChange={(e) => setCategorySortBy(e.target.value)}>
                        <option value="name_asc">По названию (А-Я)</option>
                        <option value="name_desc">По названию (Я-А)</option>
                        <option value="usage_desc">Сначала с большим числом материалов</option>
                        <option value="usage_asc">Сначала с меньшим числом материалов</option>
                    </select>
                </div>

                <table className="admin-table-categories">
                    <thead><tr><th>Название</th><th>Материалов</th><th className="th-action">Действие</th></tr></thead>
                    <tbody>
                        {sortedCategories.length > 0 ? sortedCategories.map((category) => (
                            <tr key={category.Id}>
                                <td>
                                    {editingCategoryId === category.Id ? (
                                        <input
                                            value={editingCategoryName}
                                            onChange={(e) => setEditingCategoryName(e.target.value)}
                                            style={{ margin: 0, maxWidth: '420px' }}
                                        />
                                    ) : (
                                        category.CategoryName
                                    )}
                                </td>
                                <td>{category.materialsCount}</td>
                                <td className="td-action">
                                    <div className="table-actions no-wrap">
                                        {editingCategoryId === category.Id ? (
                                            <>
                                                <button className="btn-green" onClick={saveCategoryEdit} style={actionBtnStyle}>Сохранить</button>
                                                <button className="btn-outline" onClick={cancelCategoryEdit} style={actionBtnStyle}>Отмена</button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    className="btn-outline"
                                                    onClick={() => startCategoryEdit(category)}
                                                    style={actionBtnStyle}
                                                >
                                                    Редактировать
                                                </button>
                                                <button
                                                    className="btn-red"
                                                    onClick={() =>
                                                        setConfirmDialog({
                                                            title: 'Удалить категорию?',
                                                            message: `Категория «${category.CategoryName}» будет удалена. Если к ней привязаны учебные материалы, операция будет отклонена.`,
                                                            confirmText: 'Удалить',
                                                            danger: true,
                                                            onConfirm: async () => {
                                                                await handleDeleteCategory(category);
                                                            },
                                                        })
                                                    }
                                                    style={actionBtnStyle}
                                                >
                                                    Удалить
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={3} style={{ padding: '18px 10px' }}>
                                    <div style={{ textAlign: 'center', padding: '20px', background: '#fff', borderRadius: '8px', border: '1px dashed #ccc', color: '#888' }}>
                                        Категории не найдены. Измените строку поиска.
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            )}

            {activeTab === 'materials' && (
            <div className="card">
                <h3 style={{marginTop: 0}}>Управление учебными материалами системы</h3>
                <div className="admin-toolbar">
                    <input placeholder="Введите название темы или ФИО автора..." style={{flex: 2, margin: 0}} value={matSearch} onChange={e => setMatSearch(e.target.value)} />
                    <select style={{flex: 1, margin: 0}} value={matFilterCat} onChange={e => setMatFilterCat(e.target.value)}>
                        <option value="Все">Все категории</option>
                        {categories.map(c => <option key={c.Id} value={c.CategoryName}>{c.CategoryName}</option>)}
                    </select>
                    <select style={{flex: 1, margin: 0}} value={matSortBy} onChange={e => setMatSortBy(e.target.value)}>
                        <option value="created_desc">Сначала новые</option>
                        <option value="created_asc">Сначала старые</option>
                        <option value="updated_desc">Недавно обновленные</option>
                        <option value="updated_asc">Давно не обновлялись</option>
                        <option value="title_asc">По названию (А-Я)</option>
                        <option value="title_desc">По названию (Я-А)</option>
                    </select>
                </div>
                <table className="admin-table-materials">
                    <thead><tr><th>Тема</th><th>Категория</th><th>Автор</th><th>Добавлено</th><th>Изменено</th><th className="th-action">Действие</th></tr></thead>
                    <tbody>
                        {sortedMaterials.length > 0 ? (
                            sortedMaterials.map(m => (
                                <tr key={m.Id}>
                                    <td>{m.Title}</td>
                                    <td className="admin-table-materials-td-category">
                                        <span className="badge admin-materials-category-badge" title={m.CategoryName}>{m.CategoryName}</span>
                                    </td>
                                    <td>{m.LastName} {m.FirstName[0]}.{m.MiddleName ? m.MiddleName[0]+'.' : ''}</td>
                                    <td>{formatDate(m.CreatedAt)}</td>
                                    <td>{hasMaterialUpdate(m) ? formatDate(m.UpdatedAt) : ''}</td>
                                    <td className="td-action">
                                        <div className="table-actions table-actions-admin-materials">
                                            <div className="table-actions-admin-materials__row table-actions-admin-materials__row--pair">
                                                <button
                                                    className="btn-outline"
                                                    type="button"
                                                    onClick={async () => {
                                                        const res = await api.get(`/content/${m.Id}`);
                                                        setViewMode(res.data);
                                                    }}
                                                >
                                                    Просмотр
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn-red"
                                                    onClick={() =>
                                                        setConfirmDialog({
                                                            title: 'Удалить материал?',
                                                            message: `Тема «${m.Title}» будет удалена без возможности восстановления.`,
                                                            confirmText: 'Удалить',
                                                            danger: true,
                                                            onConfirm: async () => {
                                                                await handleDeleteMaterial(m.Id);
                                                            },
                                                        })
                                                    }
                                                >
                                                    Удалить
                                                </button>
                                            </div>
                                            {m.IsPublished ? (
                                                <div className="table-actions-admin-materials__row table-actions-admin-materials__row--full">
                                                    <button
                                                        type="button"
                                                        className="btn-outline"
                                                        onClick={() =>
                                                            setConfirmDialog({
                                                                title: 'Снять материал с публикации?',
                                                                message:
                                                                    'Студенты перестанут видеть материал в каталоге. После этого его можно будет удалить из системы.',
                                                                confirmText: 'Снять с публикации',
                                                                danger: false,
                                                                onConfirm: async () => {
                                                                    await handleUnpublishMaterial(m.Id);
                                                                },
                                                            })
                                                        }
                                                    >
                                                        Снять с публикации
                                                    </button>
                                                </div>
                                            ) : null}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={6} style={{ padding: '18px 10px' }}>
                                    <div style={{ textAlign: 'center', padding: '32px', background: '#fff', borderRadius: '8px', border: '1px dashed #ccc', color: '#888' }}>
                                        Учебные материалы не найдены. Измените параметры поиска или фильтра.
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            )}

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

export default AdminDashboard;
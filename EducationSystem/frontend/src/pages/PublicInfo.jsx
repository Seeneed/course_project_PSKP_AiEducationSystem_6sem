import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { FiRefreshCw } from 'react-icons/fi';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const Flashcard = ({ term, definition }) => {
    const [isFlipped, setIsFlipped] = useState(false);
    return (
        <div className={`flashcard ${isFlipped ? 'flipped' : ''}`} onClick={() => setIsFlipped(!isFlipped)}>
            <div className="flashcard-inner flashcard-front">
                <span>{term}</span>
                <div style={{ position: 'absolute', bottom: '15px', fontSize: '12px', color: '#7f8c8d', fontWeight: 'normal' }}>
                    <FiRefreshCw size={12} style={{ marginRight: '5px', verticalAlign: 'text-top' }} />
                    Нажми, чтобы перевернуть
                </div>
            </div>
            <div className="flashcard-inner flashcard-back">{definition}</div>
        </div>
    );
};

const PublicInfo = () => {
    const [materials, setMaterials] = useState([]);
    const [categories, setCategories] = useState([]);
    const [selected, setSelected] = useState(null);
    const [search, setSearch] = useState('');
    const [filterCat, setFilterCat] = useState('Все');
    const LS_KEY = 'public_info_filters_state_v1';
    const [isStateHydrated, setIsStateHydrated] = useState(false);

    useEffect(() => {
        axios.get(`${API_BASE_URL}/content/public`).then(res => setMaterials(res.data));
        axios.get(`${API_BASE_URL}/content/categories`).then(res => setCategories(res.data));
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return;
            const persisted = JSON.parse(raw);
            if (typeof persisted.search === 'string') setSearch(persisted.search);
            if (typeof persisted.filterCat === 'string') setFilterCat(persisted.filterCat);
        } catch (_) {}
        setIsStateHydrated(true);
    }, []);

    useEffect(() => {
        if (!isStateHydrated) return;
        try {
            localStorage.setItem(LS_KEY, JSON.stringify({ search, filterCat }));
        } catch (_) {}
    }, [search, filterCat, isStateHydrated]);

    const openMaterial = (id) => {
        axios.get(`${API_BASE_URL}/content/public/${id}`).then(res => setSelected(res.data));
    };

    const filtered = materials.filter(m => {
        const authorFullName = `${m.LastName} ${m.FirstName} ${m.MiddleName || ''}`.toLowerCase();
        const matchesSearch = m.Title.toLowerCase().includes(search.toLowerCase()) || authorFullName.includes(search.toLowerCase());
        const matchesCat = filterCat === 'Все' || m.CategoryName === filterCat;
        return matchesSearch && matchesCat;
    });
    const emptyMessage = materials.length === 0
        ? 'Пока нет открытых учебных материалов. Они появятся после публикации преподавателями.'
        : 'По вашему запросу ничего не найдено. Попробуйте изменить параметры поиска или фильтра.';

    if (selected) return (
        <div className="card">
            <button className="btn-outline" onClick={() => setSelected(null)}>← Назад</button>
            <h1 className="lecture-title" style={{ marginTop: '20px' }}>{selected.Title}</h1>
            <p style={{ color: '#666', fontSize: '14px', marginTop: '-15px' }}>
                Категория: <strong>{selected.CategoryName}</strong> | Автор: {selected.LastName} {selected.FirstName} {selected.MiddleName}
            </p>

            <div className="section">
                <h3>Конспект</h3>
                <div className="guest-summary-preview">
                    <div className="guest-summary-preview-content">{selected.Summary}</div>
                    <div className="guest-summary-preview-fade">
                        <span>Продолжение конспекта доступно после входа в систему</span>
                    </div>
                </div>
            </div>

            {selected.Terms?.length > 0 && (
                <div className="section">
                    <h3>Тренажер терминов</h3>
                    <div className="flashcard-grid">
                        {selected.Terms.map((t, i) => <Flashcard key={i} term={t.term} definition={t.definition} />)}
                    </div>
                </div>
            )}

            <div className="section" style={{ textAlign: 'center', background: '#f8f9fa', border: '2px dashed var(--blue)' }}>
                <h3 style={{ border: 'none', padding: 0 }}>Заинтересовал материал?</h3>
                <p>Тестирование, ситуационная задача, вопросы для самопроверки и экспорт материалов доступны только зарегистрированным пользователям.</p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '15px' }}>
                    <Link to="/register"><button className="btn-green">Зарегистрироваться</button></Link>
                    <Link to="/login"><button className="btn-outline">Войти</button></Link>
                </div>
            </div>
        </div>
    );

    return (
        <div style={{ textAlign: 'center' }}>
            <h1>Система интеллектуальной генерации контента</h1>
            <p style={{ color: '#666', fontSize: '1.1rem' }}>Автоматическое создание учебных материалов на основе ИИ.</p>
            <hr style={{ margin: '40px 0', opacity: 0.2 }} />

            <div style={{ display: 'flex', gap: '20px', marginBottom: '30px', alignItems: 'center' }}>
                <input 
                    placeholder="Поиск по названию или автору..." 
                    style={{ flex: 2, margin: 0 }} 
                    onChange={e => setSearch(e.target.value)} 
                />
                <select 
                    style={{ flex: 1, margin: 0 }} 
                    onChange={e => setFilterCat(e.target.value)}
                >
                    <option value="Все">Все категории</option>
                    {categories.map(c => <option key={c.Id} value={c.CategoryName}>{c.CategoryName}</option>)}
                </select>
            </div>

            <h3>Открытые учебные материалы:</h3>
            <div className="grid">
                {filtered.length > 0 ? (
                    filtered.map(m => (
                        <div key={m.Id} className="card-item" style={{ textAlign: 'left' }}>
                            <span className="badge" style={{ background: '#e3f2fd', color: '#1976d2', width: 'fit-content', marginBottom: '10px' }}>
                                {m.CategoryName}
                            </span>
                            <h4 style={{ marginTop: 0, fontSize: '18px' }}>{m.Title}</h4>
                            <p style={{ fontSize: '14px', color: '#6b7280', margin: '5px 0' }}>
                                Автор: {m.LastName} {m.FirstName[0]}.{m.MiddleName ? m.MiddleName[0] + '.' : ''}
                            </p>
                            <button style={{ marginTop: '15px', width: '100%' }} onClick={() => openMaterial(m.Id)}>Открыть</button>
                        </div>
                    ))
                ) : (
                    <div style={{ gridColumn: '1 / -1', padding: '50px', background: '#fff', borderRadius: '8px', border: '1px dashed #ccc', color: '#888' }}>
                        <h4>{emptyMessage}</h4>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PublicInfo;
import React, { useState, useEffect } from 'react';
import { FiAlertCircle } from 'react-icons/fi';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';

const Register = () => {
    const [form, setForm] = useState({ username: '', password: '', firstName: '', lastName: '', middleName: '' });
    const [errors, setErrors] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();
    const isBlockingError = (message) => /заблок|block/i.test(message || '');
    const firstFieldError = errors.lastName || errors.firstName || errors.middleName || errors.username || errors.password || '';

    const regex = {
        name: /^[a-zA-Zа-яА-ЯёЁ]{2,20}$/,
        surname: /^[a-zA-Zа-яА-ЯёЁ]{2,25}(-[a-zA-Zа-яА-ЯёЁ]{2,})?$/,
        patronymic: /^[a-zA-Zа-яА-ЯёЁ]{2,25}$/, 
        email: /^([a-z0-9_\.-]+)@([a-z0-9_\.-]+)\.([a-z\.]{2,3})$/i,
        password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,20}$/
    };

    const validate = () => {
        let e = {};
        if (!regex.name.test(form.firstName)) e.firstName = "Имя: от 2 до 20 букв";
        if (!regex.surname.test(form.lastName)) e.lastName = "Фамилия: от 2 до 25 букв";
        if (!regex.patronymic.test(form.middleName)) e.middleName = "Отчество: от 2 до 25 букв";
        if (!regex.email.test(form.username)) e.username = "Некорректный Email";
        if (!regex.password.test(form.password)) e.password = "Пароль слишком простой (нужна заглавная, цифра и спецсимвол)";
        
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    useEffect(() => {
        if (!errors.server || !isBlockingError(errors.server)) return;
        const timer = setTimeout(() => {
            setErrors(prev => ({ ...prev, server: '' }));
        }, 4000);
        return () => clearTimeout(timer);
    }, [errors.server]);

    const handleFieldChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
        setErrors(prev => ({
            ...prev,
            [field]: '',
            server: ''
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;
        
        setIsSubmitting(true);
        try {
            await api.post('/auth/register', form);
            navigate('/login');
        } catch (err) {
            setErrors({ server: err.response?.data?.message || "Ошибка регистрации" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="card auth-card">
            <h2 className="auth-title">Регистрация</h2>
            
            <form onSubmit={handleSubmit}>
                <label>Фамилия</label>
                <input 
                    placeholder="Введите фамилию"
                    value={form.lastName} 
                    onChange={e => handleFieldChange('lastName', e.target.value)} 
                />

                <label style={{marginTop: '10px'}}>Имя</label>
                <input 
                    placeholder="Введите имя"
                    value={form.firstName} 
                    onChange={e => handleFieldChange('firstName', e.target.value)} 
                />

                <label style={{marginTop: '10px'}}>Отчество</label>
                <input 
                    placeholder="Введите отчество"
                    value={form.middleName} 
                    onChange={e => handleFieldChange('middleName', e.target.value)} 
                />

                <label style={{marginTop: '10px'}}>Логин (email)</label>
                <input  
                    placeholder="Введите логин"
                    value={form.username} 
                    onChange={e => handleFieldChange('username', e.target.value)} 
                />

                <label style={{marginTop: '10px'}}>Пароль</label>
                <input 
                    placeholder="Введите пароль"
                    type="password" 
                    value={form.password} 
                    onChange={e => handleFieldChange('password', e.target.value)} 
                />

                <button type="submit" style={{marginTop: '16px', width: '100%'}} disabled={isSubmitting}>
                    {isSubmitting ? 'Создание...' : 'Создать аккаунт'}
                </button>
            </form>
            {firstFieldError && (
                <div
                    className="form-feedback-panel error"
                    role="alert"
                    aria-live="assertive"
                >
                    <FiAlertCircle className="form-feedback-icon" size={18} aria-hidden />
                    <span>{firstFieldError}</span>
                </div>
            )}
            {errors.server && (
                <div
                    className="form-feedback-panel error"
                    role="alert"
                    aria-live="assertive"
                >
                    <FiAlertCircle className="form-feedback-icon" size={18} aria-hidden />
                    <span>{errors.server}</span>
                </div>
            )}
            
            <p style={{marginTop: '25px', textAlign: 'center', fontSize: '14px'}}>
                Уже есть аккаунт? <Link to="/login" style={{color:'var(--blue)', textDecoration:'none', fontWeight: '600'}}>Войти</Link>
            </p>
        </div>
    );
};

export default Register;
import React, { useState, useContext, useEffect } from 'react';
import { FiAlertCircle } from 'react-icons/fi';
import { AuthContext } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import api from '../api/axios';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [fieldErrors, setFieldErrors] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { login } = useContext(AuthContext);
    const isBlockingError = (message) => /заблок|block/i.test(message || '');
    const firstFieldError = fieldErrors.username || fieldErrors.password || '';

    useEffect(() => {
        if (!error || !isBlockingError(error)) return;
        const timer = setTimeout(() => setError(''), 4000);
        return () => clearTimeout(timer);
    }, [error]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        const nextFieldErrors = {};
        if (!username.trim()) nextFieldErrors.username = 'Введите email';
        if (!password.trim()) nextFieldErrors.password = 'Введите пароль';
        setFieldErrors(nextFieldErrors);
        if (Object.keys(nextFieldErrors).length > 0) return;
        setIsSubmitting(true);

    try {
            const res = await api.post('/auth/login', { username, password });

            login(res.data); 
            
        } catch (err) { 
            const msg = err.response?.data?.message || 'Неверный логин или пароль';
            setError(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="card auth-card">
            <h2 className="auth-title">Вход в систему</h2>

            <form onSubmit={handleSubmit} noValidate>
                <label>Логин (email)</label>
                <input 
                    type="email" 
                    placeholder="Введите логин" 
                    value={username}
                    autoComplete="username"
                    onChange={e => {
                        setUsername(e.target.value);
                        if (fieldErrors.username) setFieldErrors(prev => ({ ...prev, username: '' }));
                        if (error) setError('');
                    }} 
                />
                
                <label style={{ marginTop: '10px' }}>Пароль</label>
                <input 
                    type="password"
                    placeholder="Введите пароль"
                    value={password}
                    autoComplete="current-password"
                    onChange={e => {
                        setPassword(e.target.value);
                        if (fieldErrors.password) setFieldErrors(prev => ({ ...prev, password: '' }));
                        if (error) setError('');
                    }} 
                />
                
                <button type="submit" style={{marginTop: '16px', width: '100%'}} disabled={isSubmitting}>
                    {isSubmitting ? 'Проверка...' : 'Войти'}
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
            {error && (
                <div
                    className="form-feedback-panel error"
                    role="alert"
                    aria-live="assertive"
                >
                    <FiAlertCircle className="form-feedback-icon" size={18} aria-hidden />
                    <span>{error}</span>
                </div>
            )}

            <p style={{marginTop: '20px', textAlign: 'center', fontSize: '14px'}}>
                Нет аккаунта? <Link to="/register" style={{color:'var(--blue)', textDecoration:'none', fontWeight: '600'}}>Зарегистрироваться</Link>
            </p>
        </div>
    );
};

export default Login;
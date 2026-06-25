import React, { useState, useContext, useEffect } from 'react';
import { FiAlertCircle, FiCheckCircle } from 'react-icons/fi';
import { AuthContext } from '../context/AuthContext';
import api from '../api/axios';

const Profile = () => {
    const { user, login } = useContext(AuthContext);
    
    const [fullUserData, setFullUserData] = useState(null);
    const [loading, setLoading] = useState(true);

    const [newLogin, setNewLogin] = useState('');
    const [passForm, setPassForm] = useState({ old: '', new: '', confirm: '' });
    
    const [status, setStatus] = useState({ type: '', text: '', target: '' });

    const regex = {
        email: /^([a-z0-9_\.-]+)@([a-z0-9_\.-]+)\.([a-z\.]{2,3})$/i,
        password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,20}$/
    };

    useEffect(() => {
        fetchProfile();
    }, []);

    useEffect(() => {
        if (!status.text) return;
        const timer = setTimeout(() => {
            setStatus({ type: '', text: '', target: '' });
        }, 4000);
        return () => clearTimeout(timer);
    }, [status]);

    const fetchProfile = async () => {
        try {
            const res = await api.get('/auth/profile'); 
            setFullUserData(res.data);
        } catch (e) {
            console.error("Ошибка загрузки профиля");
        } finally {
            setLoading(false);
        }
    };

    const translateRole = (role) => {
        switch(role) {
            case 'Student': return 'Студент';
            case 'Teacher': return 'Учитель';
            case 'Admin': return 'Администратор';
            default: return role;
        }
    };

    const handleUpdateLogin = async (e) => {
        e.preventDefault();
        setStatus({ type: '', text: '', target: 'login' });

        if (!regex.email.test(newLogin)) {
            return setStatus({ type: 'error', text: 'Некорректный формат Email', target: 'login' });
        }

        if (newLogin === fullUserData?.Username) {
            return setStatus({ type: 'error', text: 'Этот логин уже используется вами', target: 'login' });
        }

        try {
            const res = await api.put('/auth/update-profile', { newUsername: newLogin });
            if (res.data?.token) login({ token: res.data.token });
            setStatus({ type: 'success', text: 'Логин изменен и применен', target: 'login' });
            setNewLogin('');
            fetchProfile();
        } catch (err) {
            setStatus({ type: 'error', text: err.response?.data?.message || 'Этот логин уже занят', target: 'login' });
        }
    };

    const handleUpdatePass = async (e) => {
        e.preventDefault();
        setStatus({ type: '', text: '', target: 'pass' });

        if (passForm.old === passForm.new) {
            return setStatus({ type: 'error', text: 'Новый пароль не может совпадать с текущим', target: 'pass' });
        }

        if (passForm.new !== passForm.confirm) {
            return setStatus({ type: 'error', text: 'Новые пароли не совпадают', target: 'pass' });
        }

        if (!regex.password.test(passForm.new)) {
            return setStatus({ type: 'error', text: 'Пароль слишком простой (нужна заглавная, цифра и спецсимвол)', target: 'pass' });
        }

        try {
            const res = await api.put('/auth/update-profile', { 
                oldPassword: passForm.old, 
                newPassword: passForm.new 
            });
            if (res.data?.token) login({ token: res.data.token });
            setStatus({ type: 'success', text: 'Пароль успешно обновлен', target: 'pass' });
            setPassForm({ old: '', new: '', confirm: '' });
            fetchProfile();
        } catch (err) {
            setStatus({ type: 'error', text: err.response?.data?.message || 'Неверный текущий пароль', target: 'pass' });
        }
    };

    if (loading) return <div className="container" style={{padding:'100px', textAlign:'center'}}>Загрузка профиля...</div>;

    return (
        <div style={{ maxWidth: '680px', margin: 'auto' }}>
            <h1 style={{ textAlign: 'center', color: 'var(--text)', marginBottom: '24px', fontSize: '32px' }}>Личный кабинет</h1>

            <div className="card" style={{ marginBottom: '30px', borderTop: '4px solid var(--blue)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', fontSize: '15px' }}>
                    <div>
                        <small style={{color:'#888'}}>ФИО</small>
                        <p style={{margin: '5px 0'}}><strong>{fullUserData?.LastName} {fullUserData?.FirstName} {fullUserData?.MiddleName}</strong></p>
                    </div>
                    <div>
                        <small style={{color:'#888'}}>Роль</small>
                        <p style={{margin: '5px 0'}}>
                            <span className="badge badge-pub">{translateRole(fullUserData?.RoleName)}</span>
                        </p>
                    </div>
                    <div>
                        <small style={{color:'#888'}}>Текущий логин</small>
                        <p style={{margin: '5px 0'}}><strong>{fullUserData?.Username}</strong></p>
                    </div>
                    <div>
                        <small style={{color:'#888'}}>Дата регистрации</small>
                        <p style={{margin: '5px 0'}}><strong>{new Date(fullUserData?.CreatedAt).toLocaleDateString('ru-RU')}</strong></p>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gap: '25px' }}>
                <div className="card">
                    <h3 style={{ marginTop: 0 }}>Изменить логин</h3>
                    <form onSubmit={handleUpdateLogin}>
                        <input
                            placeholder="Введите новый логин"
                            type="email"
                            value={newLogin}
                            onChange={e => {
                                setNewLogin(e.target.value);
                                if (status.target === 'login') setStatus({ type: '', text: '', target: '' });
                            }}
                            required
                        />
                        <button type="submit" style={{ marginTop: '15px', width: '100%' }}>Изменить логин</button>
                    </form>
                    {status.target === 'login' && status.text && (
                        <div
                            className={`form-feedback-panel ${status.type === 'error' ? 'error' : 'success'}`}
                            role={status.type === 'error' ? 'alert' : 'status'}
                            aria-live={status.type === 'error' ? 'assertive' : 'polite'}
                        >
                            {status.type === 'error' ? (
                                <FiAlertCircle className="form-feedback-icon" size={18} aria-hidden />
                            ) : (
                                <FiCheckCircle className="form-feedback-icon" size={18} aria-hidden />
                            )}
                            <span>{status.text}</span>
                        </div>
                    )}
                </div>

                <div className="card">
                    <h3 style={{ marginTop: 0 }}>Безопасность</h3>
                    <form onSubmit={handleUpdatePass}>
                        <label>Текущий пароль</label>
                        <input type="password" placeholder="Введите текущий пароль" value={passForm.old} onChange={e => {
                            setPassForm({...passForm, old: e.target.value});
                            if (status.target === 'pass') setStatus({ type: '', text: '', target: '' });
                        }} required />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                            <div>
                                <label>Новый пароль</label>
                                <input type="password" placeholder="Введите новый пароль" value={passForm.new} onChange={e => {
                                    setPassForm({...passForm, new: e.target.value});
                                    if (status.target === 'pass') setStatus({ type: '', text: '', target: '' });
                                }} required />
                            </div>
                            <div>
                                <label>Подтверждение</label>
                                <input type="password" placeholder="Подтвердите новый пароль" value={passForm.confirm} onChange={e => {
                                    setPassForm({...passForm, confirm: e.target.value});
                                    if (status.target === 'pass') setStatus({ type: '', text: '', target: '' });
                                }} required />
                            </div>
                        </div>
                        <button type="submit" className="btn-green" style={{ marginTop: '20px', width: '100%' }}>Изменить пароль</button>
                    </form>
                    {status.target === 'pass' && status.text && (
                        <div
                            className={`form-feedback-panel ${status.type === 'error' ? 'error' : 'success'}`}
                            role={status.type === 'error' ? 'alert' : 'status'}
                            aria-live={status.type === 'error' ? 'assertive' : 'polite'}
                        >
                            {status.type === 'error' ? (
                                <FiAlertCircle className="form-feedback-icon" size={18} aria-hidden />
                            ) : (
                                <FiCheckCircle className="form-feedback-icon" size={18} aria-hidden />
                            )}
                            <span>{status.text}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Profile;
import React, { useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { AuthContext } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import TeacherDashboard from './pages/TeacherDashboard';
import StudentDashboard from './pages/StudentDashboard';
import AdminDashboard from './pages/AdminDashboard';
import Profile from './pages/Profile';
import PublicInfo from './pages/PublicInfo';
import { Toaster } from 'react-hot-toast';
import { FiBookOpen, FiHome, FiLogIn, FiLogOut, FiUser, FiUserPlus } from 'react-icons/fi';

function App() {
    const { user, logout, loading } = useContext(AuthContext);
    const handleDashboardNavClick = () => {
        if (window.location.pathname === '/dashboard') {
            window.dispatchEvent(new CustomEvent('dashboard:go-home'));
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    if (loading) return <div style={{ padding: '100px', textAlign: 'center' }}>Загрузка системы...</div>;

    return (
        <BrowserRouter>
            <header>
                <h2 className="app-logo">AI-Education</h2>
                <nav className="nav-links">
                    {!user ? (
                        <>
                            <Link to="/" className="nav-link"><FiHome size={16} /> Главная</Link>
                            <Link to="/login" className="nav-link"><FiLogIn size={16} /> Вход</Link>
                            <Link to="/register" className="nav-link"><FiUserPlus size={16} /> Регистрация</Link>
                        </>
                    ) : (
                        <>
                            <Link to="/dashboard" className="nav-link" onClick={handleDashboardNavClick}>
                                <FiBookOpen size={16} />
                                {user.role === 'Admin' ? 'Панель администратора' : 'Учебная панель'}
                            </Link>
                            
                            <Link to="/profile" className="nav-link"><FiUser size={16} /> Профиль</Link>
                            <button className="logout-btn" onClick={logout}><FiLogOut size={16} /> Выйти</button>
                        </>
                    )}
                </nav>
            </header>

            <main className="container">
                <Toaster position="top-right" toastOptions={{ duration: 3200 }} />
                <Routes>
                    <Route path="/" element={<PublicInfo />} />

                    <Route path="/login" element={!user ? <Login /> : <Navigate to="/dashboard" />} />
                    <Route path="/register" element={!user ? <Register /> : <Navigate to="/dashboard" />} />

                    <Route path="/dashboard" element={
                        !user ? <Navigate to="/login" /> :
                        user.role === 'Admin' ? <AdminDashboard /> :
                        user.role === 'Teacher' ? <TeacherDashboard /> : <StudentDashboard />
                    } />

                    <Route path="/profile" element={user ? <Profile /> : <Navigate to="/login" />} />

                    <Route path="*" element={<Navigate to="/" />} />
                </Routes>
            </main>
        </BrowserRouter>
    );
}

export default App;
import React, { createContext, useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            try {
                const decoded = jwtDecode(token);
                if (decoded.exp * 1000 > Date.now()) {
                    setUser({ 
                        token, 
                        role: decoded.role, 
                        userId: decoded.userId, 
                        username: decoded.username,
                        firstName: decoded.firstName,
                        lastName: decoded.lastName
                    });
                } else { logout(); }
            } catch (e) { logout(); }
        }
        setLoading(false);
    }, []);

const login = (userData) => {
    localStorage.setItem('token', userData.token);
    const decoded = jwtDecode(userData.token);
    setUser({ ...decoded, token: userData.token });
};

    const logout = () => {
        localStorage.removeItem('token');
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};
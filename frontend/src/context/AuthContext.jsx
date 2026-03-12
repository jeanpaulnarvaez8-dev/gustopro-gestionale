import { createContext, useContext, useState, useCallback } from 'react';
import { authAPI } from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('gustopro_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const login = useCallback(async (pin) => {
    const { data } = await authAPI.login(pin);
    localStorage.setItem('gustopro_token', data.token);
    localStorage.setItem('gustopro_user', JSON.stringify(data.user));
    setUser(data.user);
    connectSocket(data.token);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('gustopro_token');
    localStorage.removeItem('gustopro_user');
    disconnectSocket();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

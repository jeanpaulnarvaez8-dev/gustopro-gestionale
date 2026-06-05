import { createContext, useContext, useState, useCallback } from 'react';
import { authAPI } from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { storage } from '../lib/storage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // storage.getJSON e' safe: in Safari Private mode / quota piena ritorna null
  // invece di crashare. Storage corrotto viene rimosso automaticamente.
  const [user, setUser] = useState(() => storage.getJSON('gustopro_user', null));

  const login = useCallback(async (pin) => {
    const { data } = await authAPI.login(pin);
    // JP 2026-06-05 FIX: storage.set ritorna false su Safari Private /
    // localStorage disabilitato → JWT non persistito → 401 → loop login.
    // Hard-fail con messaggio chiaro.
    const tokOk = storage.set('gustopro_token', data.token);
    const usrOk = storage.setJSON('gustopro_user', data.user);
    if (!tokOk || !usrOk) {
      throw new Error('Browser bloccato: disabilita modalita\' privata o autorizza i cookie');
    }
    setUser(data.user);
    connectSocket(data.token);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    storage.remove('gustopro_token');
    storage.remove('gustopro_user');
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

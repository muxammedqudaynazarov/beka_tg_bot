import { createContext, useContext, useEffect, useState } from 'react';
import { api, setAuthToken, loadStoredToken } from './api';
import { getInitData, initTelegram } from './telegram';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      initTelegram();
      loadStoredToken();
      const initData = getInitData();
      if (!initData) {
        setStatus('error');
        setError('Bu ilova faqat admin Telegram boti ichida (Mini App sifatida) ishlaydi.');
        return;
      }
      try {
        // MUHIM: admin uchun ALOHIDA endpoint — chunki initData ADMIN botining
        // o'z tokeni bilan imzolangan, foydalanuvchi bot tokeni bilan emas.
        const { data } = await api.post('/auth/telegram-admin', { initData });
        setAuthToken(data.token);
        setAdmin(data.user);
        setStatus('ready');
      } catch (err) {
        setStatus('error');
        setError(err.response?.data?.error || 'Kirishda xatolik yuz berdi.');
      }
    })();
  }, []);

  return <AuthContext.Provider value={{ admin, status, error }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

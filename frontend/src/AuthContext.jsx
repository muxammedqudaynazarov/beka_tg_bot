import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setAuthToken, loadStoredToken } from './api';
import { getInitData, initTelegram } from './telegram';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);

  const refreshProfile = useCallback(async () => {
    const { data } = await api.get('/profile');
    setUser((prev) => ({ ...prev, ...data.user }));
    return data;
  }, []);

  useEffect(() => {
    (async () => {
      initTelegram();
      loadStoredToken();
      const initData = getInitData();

      if (!initData) {
        // Telegram tashqarisida (masalan brauzerda dasturchi ko'rib chiqayotganda) ochilgan.
        setStatus('error');
        setError('Это приложение полноценно работает только внутри Telegram (как Mini App).');
        return;
      }

      try {
        const { data } = await api.post('/auth/telegram', { initData });
        setAuthToken(data.token);
        setUser(data.user);
        setStatus('ready');
      } catch (err) {
        setStatus('error');
        setError(err.response?.data?.error || 'Произошла ошибка при входе.');
      }
    })();
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, status, error, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

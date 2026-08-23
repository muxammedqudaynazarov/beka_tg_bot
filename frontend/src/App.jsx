import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { FiltersProvider } from './FiltersContext';
import BottomNav from './components/BottomNav';
import AdPopup from './components/AdPopup';
import SplashScreen from './components/SplashScreen';
import HomePage from './pages/HomePage';
import FilterPage from './pages/FilterPage';
import PaymentPage from './pages/PaymentPage';
import ProfilePage from './pages/ProfilePage';
import WheelPage from './pages/WheelPage';
import AuctionDetailPage from './pages/AuctionDetailPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';

// 7-band: kanaldagi "Перейти к лоту" tugmasi t.me/BOT/APP?startapp=auction_ID
// ko'rinishida ochiladi — Telegram bu qiymatni Mini App'ga start_param
// sifatida beradi. Ilova ochilganda shuni bir marta tekshirib, to'g'ridan-
// to'g'ri o'sha auksion sahifasiga o'tkazamiz.
function StartParamRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
    if (startParam?.startsWith('auction_')) {
      navigate(`/auction/${startParam.replace('auction_', '')}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function AuthGate({ children }) {
  const { status, error, showPopupAd } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  // Splash-ekran hali "tugatilmagan" bo'lsa — status loading/error/ready
  // bo'lishidan qat'iy nazar, avval SHUNI ko'rsatamiz (kamida 3 soniya, va
  // kontent tayyor bo'lguncha davom etadi).
  if (!splashDone) {
    return <SplashScreen ready={status !== 'loading'} onDone={() => setSplashDone(true)} />;
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="font-display text-base font-semibold text-ink-primary">Не удалось войти</p>
        <p className="text-sm text-ink-secondary">{error}</p>
      </div>
    );
  }

  return (
    <>
      <AdPopup shouldShow={showPopupAd} />
      {children}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <FiltersProvider>
        <AuthGate>
          <BrowserRouter>
            <StartParamRedirect />
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/filter" element={<FilterPage />} />
              <Route path="/payment" element={<PaymentPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/wheel" element={<WheelPage />} />
              <Route path="/auction/:id" element={<AuctionDetailPage />} />
              <Route path="/privacy" element={<PrivacyPolicyPage />} />
            </Routes>
            <BottomNav />
          </BrowserRouter>
        </AuthGate>
      </FiltersProvider>
    </AuthProvider>
  );
}

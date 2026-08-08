import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { FiltersProvider } from './FiltersContext';
import BottomNav from './components/BottomNav';
import HomePage from './pages/HomePage';
import FilterPage from './pages/FilterPage';
import PaymentPage from './pages/PaymentPage';
import ProfilePage from './pages/ProfilePage';
import AuctionDetailPage from './pages/AuctionDetailPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import AccountDetailsPage from './pages/AccountDetailsPage';

function AuthGate({ children }) {
  const { status, error } = useAuth();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-ink-secondary">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-rarity-covert border-t-transparent" />
        <p className="font-display text-sm">Загрузка…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="font-display text-base font-semibold text-ink-primary">Не удалось войти</p>
        <p className="text-sm text-ink-secondary">{error}</p>
      </div>
    );
  }

  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <FiltersProvider>
        <AuthGate>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/filter" element={<FilterPage />} />
              <Route path="/payment" element={<PaymentPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/auction/:id" element={<AuctionDetailPage />} />
              <Route path="/privacy" element={<PrivacyPolicyPage />} />
              <Route path="/account" element={<AccountDetailsPage />} />
            </Routes>
            <BottomNav />
          </BrowserRouter>
        </AuthGate>
      </FiltersProvider>
    </AuthProvider>
  );
}

import { useState } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import NewAuctionPage from './pages/NewAuctionPage';
import CategoriesPage from './pages/CategoriesPage';
import AuctionsPage from './pages/AuctionsPage';

const TABS = [
  { key: 'new', label: 'Yangi auksion' },
  { key: 'auctions', label: 'Auksionlar' },
  { key: 'categories', label: 'Kategoriyalar' },
];

function Shell() {
  const { admin, status, error } = useAuth();
  const [tab, setTab] = useState('new');

  if (status === 'loading') {
    return <div className="flex min-h-screen items-center justify-center text-muted text-sm">Yuklanmoqda…</div>;
  }
  if (status === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-semibold text-ink">Kirib bo'lmadi</p>
        <p className="text-xs text-muted">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-6 text-ink">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur">
        <h1 className="text-sm font-bold">
          CS2 Admin <span className="text-muted font-normal">· {admin?.role === 'SUPERADMIN' ? 'bosh admin' : 'admin'}</span>
        </h1>
      </header>

      <nav className="flex gap-1 border-b border-border px-3 py-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              tab === t.key ? 'bg-accent text-white' : 'bg-surface text-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="px-4 py-4">
        {tab === 'new' && <NewAuctionPage />}
        {tab === 'auctions' && <AuctionsPage />}
        {tab === 'categories' && <CategoriesPage />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import SearchBar from '../components/SearchBar';
import TabPills from '../components/TabPills';
import AuctionListItem from '../components/AuctionListItem';
import LiveTicker from '../components/LiveTicker';
import { useFilters } from '../FiltersContext';

export default function HomePage() {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState(null);
  const [items, setItems] = useState(null); // null = hali yuklanmagan (6-band: to'liq yuklanmaguncha ko'rsatilmasin)
  const navigate = useNavigate();
  const { filters } = useFilters();

  const queryParams = useMemo(() => {
    const params = {};
    if (search.trim()) params.search = search.trim();
    if (tab) params.tab = tab;
    if (filters.categoryIds?.length) params.categoryIds = filters.categoryIds.join(',');
    if (filters.subcategoryIds?.length) params.subcategoryIds = filters.subcategoryIds.join(',');
    if (filters.wear?.length) params.wear = filters.wear.join(',');
    if (filters.statTrak !== null) params.statTrak = String(filters.statTrak);
    if (filters.sort) params.sort = filters.sort;
    return params;
  }, [search, tab, filters]);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    api.get('/auctions', { params: queryParams }).then(({ data }) => {
      if (!cancelled) setItems(data.items || []);
    });
    return () => {
      cancelled = true;
    };
  }, [queryParams]);

  const activeFilterCount =
    (filters.categoryIds?.length || 0) + (filters.subcategoryIds?.length || 0) + (filters.wear?.length || 0) + (filters.statTrak !== null ? 1 : 0) + (filters.sort ? 1 : 0);
  const loading = items === null;

  return (
    <div className="flex min-h-screen flex-col pb-32">
      <header className="sticky top-0 z-10 space-y-2.5 border-b border-base-border bg-base-bg/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-base font-bold tracking-wide text-ink-primary">
            CS2 <span className="text-rarity-covert">AUKSION</span>
          </h1>
        </div>
        <SearchBar value={search} onChange={setSearch} />
        <div className="flex items-center gap-2">
          <TabPills active={tab} onChange={setTab} onOpenFilter={() => navigate('/filter')} />
          {activeFilterCount > 0 && (
            <span className="shrink-0 rounded-full bg-rarity-covert px-1.5 py-0.5 text-[9px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 px-3 pt-3">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[76px] animate-pulse rounded-lg bg-base-surface" />
            ))}
          </div>
        ) : items.length ? (
          <div className="space-y-2">
            {items.map((a) => (
              <AuctionListItem key={a.id} auction={a} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <p className="font-display text-sm font-semibold text-ink-primary">Ничего не найдено</p>
            <p className="max-w-xs text-xs text-ink-secondary">Попробуйте изменить поисковый запрос или фильтры.</p>
          </div>
        )}
      </main>

      <LiveTicker />
    </div>
  );
}

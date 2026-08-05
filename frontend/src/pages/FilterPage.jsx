import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ArrowUpNarrowWide, ArrowDownNarrowWide } from 'lucide-react';
import { api } from '../api';
import { useFilters } from '../FiltersContext';
import { WEAR_LABELS } from '../constants';

function SectionTitle({ children }) {
  return <h2 className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-ink-secondary">{children}</h2>;
}

export default function FilterPage() {
  const navigate = useNavigate();
  const { filters, setFilters, resetFilters } = useFilters();
  const [categories, setCategories] = useState(null); // null = hali yuklanmoqda (6-band)
  const [draft, setDraft] = useState(filters);

  useEffect(() => {
    api.get('/categories').then(({ data }) => setCategories(data.items || []));
  }, []);

  function toggleWear(code) {
    setDraft((d) => ({
      ...d,
      wear: d.wear.includes(code) ? d.wear.filter((w) => w !== code) : [...d.wear, code],
    }));
  }

  function apply() {
    setFilters(draft);
    navigate(-1);
  }

  function clearAll() {
    resetFilters();
    setDraft({ categoryId: null, wear: [], statTrak: null, sort: null });
  }

  const loading = categories === null;

  return (
    <div className="min-h-screen pb-28">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-base-border bg-base-bg/95 px-4 py-3.5 backdrop-blur">
        <button onClick={() => navigate(-1)} className="text-ink-secondary">
          <ChevronLeft size={20} />
        </button>
        <h1 className="font-display text-base font-bold text-ink-primary">Filtr</h1>
      </header>

      {loading ? (
        <main className="space-y-6 px-4 pt-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-24 animate-pulse rounded bg-base-surface" />
              <div className="flex gap-2">
                {[0, 1, 2].map((j) => (
                  <div key={j} className="h-8 w-20 animate-pulse rounded-full bg-base-surface" />
                ))}
              </div>
            </div>
          ))}
        </main>
      ) : (
        <main className="space-y-6 px-4 pt-5">
          {/* Kategoriya bo'yicha (skin/qurol nomi) */}
          <section>
            <SectionTitle>Qurol / kategoriya</SectionTitle>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setDraft((d) => ({ ...d, categoryId: null }))}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  !draft.categoryId ? 'bg-rarity-covert text-white' : 'bg-base-surface text-ink-secondary'
                }`}
              >
                Barchasi
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setDraft((d) => ({ ...d, categoryId: c.id }))}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    draft.categoryId === c.id ? 'bg-rarity-covert text-white' : 'bg-base-surface text-ink-secondary'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </section>

          {/* Format factory (wear) bo'yicha */}
          <section>
            <SectionTitle>Format factory</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {Object.entries(WEAR_LABELS).map(([code, label]) => (
                <button
                  key={code}
                  onClick={() => toggleWear(code)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    draft.wear.includes(code) ? 'bg-rarity-covert text-white' : 'bg-base-surface text-ink-secondary'
                  }`}
                >
                  {code} <span className="opacity-70">· {label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* StatTrak bo'yicha */}
          <section>
            <SectionTitle>StatTrak™</SectionTitle>
            <div className="flex gap-2">
              {[
                { v: null, l: 'Farqi yo\'q' },
                { v: true, l: 'Faqat StatTrak™' },
                { v: false, l: 'Oddiy' },
              ].map((opt) => (
                <button
                  key={String(opt.v)}
                  onClick={() => setDraft((d) => ({ ...d, statTrak: opt.v }))}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    draft.statTrak === opt.v ? 'bg-rarity-covert text-white' : 'bg-base-surface text-ink-secondary'
                  }`}
                >
                  {opt.l}
                </button>
              ))}
            </div>
          </section>

          {/* Narx tartibi */}
          <section>
            <SectionTitle>Narx bo'yicha tartiblash</SectionTitle>
            <div className="flex gap-2">
              <button
                onClick={() => setDraft((d) => ({ ...d, sort: d.sort === 'price_asc' ? null : 'price_asc' }))}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                  draft.sort === 'price_asc' ? 'bg-rarity-covert text-white' : 'bg-base-surface text-ink-secondary'
                }`}
              >
                <ArrowUpNarrowWide size={13} /> Arzondan qimmatga
              </button>
              <button
                onClick={() => setDraft((d) => ({ ...d, sort: d.sort === 'price_desc' ? null : 'price_desc' }))}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                  draft.sort === 'price_desc' ? 'bg-rarity-covert text-white' : 'bg-base-surface text-ink-secondary'
                }`}
              >
                <ArrowDownNarrowWide size={13} /> Qimmatdan arzonga
              </button>
            </div>
          </section>
        </main>
      )}

      <div className="fixed inset-x-0 bottom-16 z-20 flex gap-3 border-t border-base-border bg-base-bg/95 px-4 py-3 backdrop-blur">
        <button onClick={clearAll} className="flex-1 rounded-xl bg-base-surface py-2.5 font-display text-sm font-semibold text-ink-secondary">
          Tozalash
        </button>
        <button onClick={apply} className="flex-1 rounded-xl bg-rarity-covert py-2.5 font-display text-sm font-semibold text-white">
          Qo'llash
        </button>
      </div>
    </div>
  );
}

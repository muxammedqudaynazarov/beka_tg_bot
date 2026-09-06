import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ChevronDown } from 'lucide-react';

/**
 * Live-search bilan tanlash maydoni: matn kiritilganda ro'yxat shu zahoti
 * filtrlanadi. Ko'p sonli variantlar (masalan barcha sub-kategoriyalar)
 * orasidan keraklisini tez topish uchun ishlatiladi.
 *
 * options: [{ value, label, group? }]  — "group" bo'lsa, variant ostida
 * kichik matn sifatida ko'rsatiladi (masalan ota-kategoriya nomi).
 */
export default function SearchableSelect({ options, value, onChange, placeholder = 'Qidirish…', disabled = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function onClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.group && o.group.toLowerCase().includes(q))
    );
  }, [options, query]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen((v) => !v); setQuery(''); }}
        className="flex w-full items-center justify-between rounded-md border border-border bg-surface px-2 py-1.5 text-left text-xs text-ink disabled:opacity-50"
      >
        <span className={selected ? 'text-ink' : 'text-muted'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={13} className="shrink-0 text-muted" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-border bg-bg shadow-lg">
          <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
            <Search size={12} className="shrink-0 text-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Qidirish…"
              className="w-full bg-transparent text-xs text-ink placeholder:text-muted focus:outline-none"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length ? (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false); setQuery(''); }}
                  className={`block w-full px-2.5 py-1.5 text-left text-xs hover:bg-surface ${
                    o.value === value ? 'bg-accent/20 text-accent' : 'text-ink'
                  }`}
                >
                  {o.label}
                  {o.group && <span className="ml-1.5 text-[10px] text-muted">· {o.group}</span>}
                </button>
              ))
            ) : (
              <p className="px-2.5 py-2 text-xs text-muted">Hech narsa topilmadi</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

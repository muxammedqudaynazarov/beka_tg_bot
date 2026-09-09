import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

/**
 * TeamInput — jamoa nomi kiritish maydoni + reestdan avto-to'ldirish.
 * Foydalanuvchi yozayotganda bazadan mos jamoalar qidirilib ko'rsatiladi.
 * Tanlanganda nomi va logotipi avto to'ldiriladi.
 */
export default function TeamInput({ label, name, imageUrl, onChangeName, onChangeImage, placeholder }) {
  const [query, setQuery] = useState(name || '');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef(null);
  const containerRef = useRef(null);

  // Tashqi yopish
  useEffect(() => {
    function handle(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // Debounce qidiruv
  useEffect(() => {
    clearTimeout(timerRef.current);
    if (query.trim().length < 1) { setSuggestions([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/teams/search?q=${encodeURIComponent(query)}`);
        setSuggestions(data.items || []);
        setOpen((data.items || []).length > 0);
      } catch { setSuggestions([]); }
    }, 280);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  function pick(team) {
    setQuery(team.name);
    onChangeName(team.name);
    if (team.imageUrl) onChangeImage(team.imageUrl);
    setSuggestions([]);
    setOpen(false);
  }

  const inputCls = 'w-full rounded-xl border border-base-border bg-base-surface px-3.5 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted focus:border-rarity-covert focus:outline-none';

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1 block text-[11px] text-ink-secondary">{label}</label>
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); onChangeName(e.target.value); }}
        placeholder={placeholder || 'Команда...'}
        className={inputCls}
        autoComplete="off"
      />

      {/* Taklif ro'yxati */}
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-lg">
          {suggestions.map(t => (
            <button key={t.id} onMouseDown={() => pick(t)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-base-surface2">
              {t.imageUrl ? (
                <img src={t.imageUrl} alt={t.name} className="h-6 w-6 object-contain" />
              ) : (
                <div className="h-6 w-6 rounded bg-base-surface2" />
              )}
              <span className="text-sm text-ink-primary">{t.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Logotip URL maydoni */}
      <input
        value={imageUrl}
        onChange={e => onChangeImage(e.target.value)}
        placeholder="Логотип URL (необязательно)"
        className={inputCls + ' mt-1.5 text-xs'}
      />
      {imageUrl && (
        <img src={imageUrl} alt="" className="mt-1.5 h-8 w-8 object-contain opacity-80"
          onError={e => { e.target.style.display = 'none'; }} />
      )}
    </div>
  );
}

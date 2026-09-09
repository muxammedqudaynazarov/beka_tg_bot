import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

/**
 * To'liq kontrolli TeamInput — ichki `query` state yo'q,
 * barcha qiymatlar ota komponentdan boshqariladi.
 * Shu sabab "Fu" yozib Furia tanlasa, forma state'ga "Furia" boradi.
 */
export default function TeamInput({ label, name, imageUrl, onChangeName, onChangeImage, placeholder }) {
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
    document.addEventListener('touchstart', handle);
    return () => { document.removeEventListener('mousedown', handle); document.removeEventListener('touchstart', handle); };
  }, []);

  // Debounce qidiruv — faqat `name` o'zgarganda
  useEffect(() => {
    clearTimeout(timerRef.current);
    const q = (name || '').trim();
    if (q.length < 1) { setSuggestions([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/teams/search?q=${encodeURIComponent(q)}`);
        const items = data.items || [];
        setSuggestions(items);
        setOpen(items.length > 0);
      } catch { setSuggestions([]); }
    }, 280);
    return () => clearTimeout(timerRef.current);
  }, [name]);

  // Tanlash — ota state'ni yangi qiymat bilan yangilaymiz
  function pick(team) {
    onChangeName(team.name);           // ota forma: teamAName = "Furia"
    if (team.imageUrl) onChangeImage(team.imageUrl);
    setSuggestions([]);
    setOpen(false);
  }

  const inputCls = 'w-full rounded-xl border border-base-border bg-base-surface px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:border-rarity-covert focus:outline-none';

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1 block text-[11px] text-ink-secondary">{label}</label>
      <input
        value={name}  // to'liq kontrolli — ichki state yo'q
        onChange={e => onChangeName(e.target.value)}
        placeholder={placeholder || 'Команда...'}
        className={inputCls}
        autoComplete="off"
      />

      {/* Taklif ro'yxati */}
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-lg">
          {suggestions.map(t => (
            <button key={t.id}
              onMouseDown={e => { e.preventDefault(); pick(t); }}
              onTouchEnd={e => { e.preventDefault(); pick(t); }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-base-surface2">
              {t.imageUrl
                ? <img src={t.imageUrl} alt={t.name} className="h-6 w-6 object-contain" />
                : <div className="h-6 w-6 rounded bg-base-surface2" />}
              <span className="text-sm text-ink-primary">{t.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Logotip URL */}
      <input
        value={imageUrl}
        onChange={e => onChangeImage(e.target.value)}
        placeholder="Логотип URL"
        className={inputCls + ' mt-1.5 text-xs'}
      />
      {imageUrl && (
        <img src={imageUrl} alt="" className="mt-1 h-7 w-7 object-contain opacity-70"
          onError={e => { e.target.style.display = 'none'; }} />
      )}
    </div>
  );
}

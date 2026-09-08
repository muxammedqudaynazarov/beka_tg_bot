import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function PredictionBanner() {
  const [items, setItems] = useState([]);
  const [current, setCurrent] = useState(0);
  const navigate = useNavigate();
  const intervalRef = useRef(null);

  useEffect(() => {
    api.get('/predictions/active').then(({ data }) => setItems(data.items || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (items.length <= 1) return;
    intervalRef.current = setInterval(() => {
      setCurrent((c) => (c + 1) % items.length);
    }, 4000);
    return () => clearInterval(intervalRef.current);
  }, [items.length]);

  if (!items.length) return null;

  const p = items[current];
  const streamerName = p.createdBy?.username ? `@${p.createdBy.username}` : p.createdBy?.firstName || 'Стример';
  const remaining = Math.max(0, Math.floor((new Date(p.endsAt) - Date.now()) / 60000));

  return (
    <div className="mb-4">
      <button
        onClick={() => navigate(`/prediction/${p.id}`)}
        className="w-full overflow-hidden rounded-xl border border-rarity-covert/40 bg-rarity-covert/10 text-left"
      >
        <div className="flex items-center gap-2 bg-rarity-covert/20 px-3 py-1.5">
          <span className="flex h-2 w-2 rounded-full bg-signal-danger">
            <span className="animate-ping inline-flex h-2 w-2 rounded-full bg-signal-danger opacity-75" />
          </span>
          <span className="font-display text-[10px] font-bold uppercase tracking-wide text-rarity-covert">
            Прогноз точного счёта
          </span>
          {items.length > 1 && (
            <span className="ml-auto flex gap-1">
              {items.map((_, i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all ${i === current ? 'w-3 bg-rarity-covert' : 'w-1.5 bg-base-border'}`} />
              ))}
            </span>
          )}
        </div>
        <div className="px-3 py-2.5">
          <p className="text-[10px] text-ink-muted">{streamerName} стримида</p>
          <p className="mt-0.5 font-display text-sm font-semibold text-ink-primary">{p.title}</p>
          <div className="mt-1.5 flex items-center gap-3 text-[10px] text-ink-secondary">
            <span>🎮 {p.format}</span>
            <span>👥 {p._count?.entries ?? 0} участников</span>
            <span className="ml-auto text-signal-warning">
              {remaining > 0 ? `⏱ ${remaining} мин.` : 'Скоро закрывается'}
            </span>
          </div>
        </div>
      </button>
    </div>
  );
}

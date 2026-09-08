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
    intervalRef.current = setInterval(() => setCurrent((c) => (c + 1) % items.length), 4000);
    return () => clearInterval(intervalRef.current);
  }, [items.length]);

  if (!items.length) return null;

  const p = items[current];
  const streamer = p.createdBy?.username ? `@${p.createdBy.username}` : p.createdBy?.firstName || 'Стример';
  const remaining = Math.max(0, Math.floor((new Date(p.endsAt) - Date.now()) / 60000));

  return (
    <div className="mx-0 mt-4 mb-3">
      <button
        onClick={() => navigate(`/prediction/${p.id}`)}
        className="relative w-full overflow-hidden rounded-2xl text-left"
        style={{
          background: 'linear-gradient(135deg, #1a0a2e 0%, #0f1320 50%, #0a1a1f 100%)',
          border: '1px solid rgba(235,75,75,0.25)',
          boxShadow: '0 0 24px rgba(235,75,75,0.08), 0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        {/* Animatsion fon effektlari */}
        <div
          className="animate-pred-glow pointer-events-none absolute -left-6 -top-6 h-28 w-28 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(235,75,75,0.35) 0%, transparent 70%)' }}
        />
        <div
          className="animate-pred-glow2 pointer-events-none absolute -bottom-4 -right-4 h-24 w-24 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(138,43,226,0.3) 0%, transparent 70%)' }}
        />
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.02), transparent)' }}
        />

        {/* Kontent */}
        <div className="relative px-4 pt-3.5 pb-3">
          {/* Sarlavha qatori */}
          <div className="mb-2.5 flex items-center gap-2">
            <span className="flex items-center gap-1.5">
              <span
                className="animate-pred-dot inline-block h-2 w-2 rounded-full"
                style={{ background: '#eb4b4b', boxShadow: '0 0 6px #eb4b4b' }}
              />
              <span className="font-display text-[10px] font-bold uppercase tracking-widest" style={{ color: '#eb4b4b' }}>
                Прогноз точного счёта
              </span>
            </span>
            <span
              className="ml-auto rounded-full px-2 py-0.5 font-display text-[9px] font-bold"
              style={{ background: 'rgba(235,75,75,0.2)', color: '#ef8383', border: '1px solid rgba(235,75,75,0.3)' }}
            >
              LIVE
            </span>
          </div>

          {/* Streamer */}
          <p className="mb-1 text-[10px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {streamer} стримида
          </p>

          {/* Match nomi */}
          <p className="font-display text-base font-bold leading-snug" style={{ color: 'rgba(255,255,255,0.92)' }}>
            {p.title}
          </p>

          {/* Pastki satir */}
          <div className="mt-2.5 flex items-center gap-3">
            <span
              className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}
            >
              {p.format}
            </span>
            <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
              👥 {p._count?.entries ?? 0} участников
            </span>
            <span className="text-[10px]" style={{ color: remaining > 10 ? 'rgba(255,255,255,0.45)' : '#f5a623' }}>
              ⏱ {remaining > 0 ? `${remaining} мин.` : 'Скоро закрывается'}
            </span>
            <span
              className="ml-auto text-[10px] font-semibold"
              style={{ color: '#eb4b4b' }}
            >
              Участвовать →
            </span>
          </div>
        </div>

        {/* Dots (bir nechta prediction bo'lsa) */}
        {items.length > 1 && (
          <div className="relative flex justify-center gap-1.5 pb-2.5">
            {items.map((_, i) => (
              <span
                key={i}
                className="inline-block rounded-full transition-all duration-300"
                style={{
                  width: i === current ? 14 : 5,
                  height: 3,
                  background: i === current ? '#eb4b4b' : 'rgba(255,255,255,0.2)',
                }}
              />
            ))}
          </div>
        )}
      </button>
    </div>
  );
}

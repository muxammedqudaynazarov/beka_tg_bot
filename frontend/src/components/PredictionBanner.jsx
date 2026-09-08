import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function PredictionBanner() {
  const [items, setItems] = useState([]);
  const [current, setCurrent] = useState(0);
  const [animDir, setAnimDir] = useState(null); // 'left' | 'right'
  const [isAnimating, setIsAnimating] = useState(false);
  const navigate = useNavigate();
  const timerRef = useRef(null);
  const touchStartX = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    api.get('/predictions/active').then(({ data }) => setItems(data.items || [])).catch(() => {});
  }, []);

  function goTo(idx, dir) {
    if (isAnimating || idx === current) return;
    setAnimDir(dir);
    setIsAnimating(true);
    setTimeout(() => {
      setCurrent(idx);
      setIsAnimating(false);
      setAnimDir(null);
    }, 320);
  }

  function next() {
    if (items.length < 2) return;
    goTo((current + 1) % items.length, 'left');
  }

  function prev() {
    if (items.length < 2) return;
    goTo((current - 1 + items.length) % items.length, 'right');
  }

  // Avtomatik almashtirish
  useEffect(() => {
    if (items.length <= 1) return;
    timerRef.current = setInterval(next, 5000);
    return () => clearInterval(timerRef.current);
  }, [items.length, current, isAnimating]);

  // Touch / swipe
  function onTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
    clearInterval(timerRef.current);
  }
  function onTouchEnd(e) {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) diff > 0 ? next() : prev();
    touchStartX.current = null;
  }

  if (!items.length) return null;
  const p = items[current];
  const streamer = p.createdBy?.username ? `@${p.createdBy.username}` : p.createdBy?.firstName || 'Стример';
  const remaining = Math.max(0, Math.floor((new Date(p.endsAt) - Date.now()) / 60000));

  // Slide animatsiya stili
  const slideStyle = isAnimating
    ? {
        transform: animDir === 'left' ? 'translateX(-4%)' : 'translateX(4%)',
        opacity: 0,
        transition: 'all 0.32s cubic-bezier(0.4,0,0.2,1)',
      }
    : {
        transform: 'translateX(0)',
        opacity: 1,
        transition: 'all 0.32s cubic-bezier(0.4,0,0.2,1)',
      };

  return (
    <div className="mx-0 mt-4 mb-3">
      <div
        ref={containerRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={() => navigate(`/prediction/${p.id}`)}
        className="relative w-full overflow-hidden rounded-2xl cursor-pointer select-none"
        style={{
          background: 'linear-gradient(135deg, #1a0a2e 0%, #0f1320 55%, #071820 100%)',
          border: '1px solid rgba(235,75,75,0.2)',
          boxShadow: '0 0 32px rgba(235,75,75,0.07), 0 4px 16px rgba(0,0,0,0.35)',
          minHeight: 110,
        }}
      >
        {/* ============ ANIMATSION FON ============ */}
        {/* Qizil sharlar */}
        <div className="animate-pred-glow pointer-events-none absolute -left-8 -top-8 h-36 w-36 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(235,75,75,0.3) 0%, transparent 68%)' }} />
        <div className="animate-pred-glow2 pointer-events-none absolute right-0 top-2 h-24 w-24 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(138,43,226,0.22) 0%, transparent 70%)' }} />
        <div className="animate-pred-glow pointer-events-none absolute bottom-0 left-1/3 h-20 w-20 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(0,180,255,0.1) 0%, transparent 70%)', animationDelay: '1.5s' }} />
        {/* Yaltirab turuvchi chiziq */}
        <div className="pointer-events-none absolute inset-0"
          style={{ background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.03) 50%, transparent 70%)' }} />

        {/* ============ KONTENT (sliding) ============ */}
        <div style={slideStyle} className="relative px-4 pt-3.5 pb-2.5">
          {/* Sarlavha */}
          <div className="mb-2 flex items-center gap-2">
            <span className="flex items-center gap-1.5">
              <span className="animate-pred-dot inline-block h-2 w-2 rounded-full"
                style={{ background: '#eb4b4b', boxShadow: '0 0 7px #eb4b4b' }} />
              <span className="font-display text-[10px] font-bold uppercase tracking-widest" style={{ color: '#eb4b4b' }}>
                Прогноз точного счёта
              </span>
            </span>
            <span className="ml-auto rounded-full px-2 py-0.5 font-display text-[9px] font-bold"
              style={{ background: 'rgba(235,75,75,0.18)', color: '#ef8383', border: '1px solid rgba(235,75,75,0.28)' }}>
              LIVE
            </span>
          </div>

          {/* Streamer */}
          <p className="mb-1 text-[10px]" style={{ color: 'rgba(255,255,255,0.42)' }}>
            {streamer} стримида
          </p>

          {/* Match */}
          <p className="font-display text-[15px] font-bold leading-snug" style={{ color: 'rgba(255,255,255,0.93)' }}>
            {p.title}
          </p>

          {/* Meta */}
          <div className="mt-2 flex items-center gap-3">
            <span className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold"
              style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.55)' }}>
              {p.format}
            </span>
            <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
              👥 {p._count?.entries ?? 0}
            </span>
            <span className="text-[10px]" style={{ color: remaining > 10 ? 'rgba(255,255,255,0.4)' : '#f5a623' }}>
              ⏱ {remaining > 0 ? `${remaining} мин.` : 'Скоро закрывается'}
            </span>
            <span className="ml-auto text-[10px] font-semibold" style={{ color: '#eb4b4b' }}>
              Участвовать →
            </span>
          </div>
        </div>

        {/* ============ DOTS ============ */}
        {items.length > 1 && (
          <div className="relative flex justify-center gap-1.5 pb-2">
            {items.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); goTo(i, i > current ? 'left' : 'right'); }}
                className="rounded-full transition-all duration-300"
                style={{
                  width: i === current ? 16 : 6,
                  height: 4,
                  background: i === current ? '#eb4b4b' : 'rgba(255,255,255,0.18)',
                  border: 'none',
                  padding: 0,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

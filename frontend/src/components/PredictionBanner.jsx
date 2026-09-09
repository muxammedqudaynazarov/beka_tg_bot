import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import teamAPlaceholder from '../assets/team-a-placeholder.png';
import teamBPlaceholder from '../assets/team-b-placeholder.png';

export default function PredictionBanner() {
  const [items, setItems] = useState([]);
  const [current, setCurrent] = useState(0);
  const [animDir, setAnimDir] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const navigate = useNavigate();
  const timerRef = useRef(null);
  const touchStartX = useRef(null);

  useEffect(() => {
    api.get('/predictions/active').then(({ data }) => setItems(data.items || [])).catch(() => {});
  }, []);

  function goTo(idx, dir) {
    if (isAnimating || idx === current) return;
    setAnimDir(dir);
    setIsAnimating(true);
    setTimeout(() => { setCurrent(idx); setIsAnimating(false); setAnimDir(null); }, 300);
  }

  function next() { if (items.length > 1) goTo((current + 1) % items.length, 'left'); }

  useEffect(() => {
    if (items.length <= 1) return;
    timerRef.current = setInterval(next, 5000);
    return () => clearInterval(timerRef.current);
  }, [items.length, current, isAnimating]);

  function onTouchStart(e) { touchStartX.current = e.touches[0].clientX; clearInterval(timerRef.current); }
  function onTouchEnd(e) {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) diff > 0 ? next() : goTo((current - 1 + items.length) % items.length, 'right');
    touchStartX.current = null;
  }

  if (!items.length) return null;
  const p = items[current];

  const streamerTag = p.createdBy?.username
    ? `@${p.createdBy.username.toUpperCase()}`
    : p.createdBy?.firstName?.toUpperCase() || 'СТРИМЕР';
  const remaining = Math.max(0, Math.floor((new Date(p.endsAt) - Date.now()) / 60000));

  // Jamoalar nomi: teamAName/teamBName bo'lsa ularni, bo'lmasa title'dan ajratamiz
  const hasTeams = p.teamAName || p.teamBName;
  const teamA = p.teamAName || '';
  const teamB = p.teamBName || '';

  const slideStyle = isAnimating
    ? { transform: animDir === 'left' ? 'translateX(-5%)' : 'translateX(5%)', opacity: 0, transition: 'all 0.3s ease' }
    : { transform: 'translateX(0)', opacity: 1, transition: 'all 0.3s ease' };

  return (
    <div className="mx-0 mt-4 mb-3">
      <button
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={() => navigate(`/prediction/${p.id}`)}
        className="relative w-full overflow-hidden rounded-2xl text-left cursor-pointer select-none"
        style={{
          background: 'linear-gradient(135deg, #1a0a2e 0%, #0f1320 55%, #071820 100%)',
          border: '1px solid rgba(235,75,75,0.2)',
          boxShadow: '0 0 32px rgba(235,75,75,0.07), 0 4px 16px rgba(0,0,0,0.35)',
        }}
      >
        {/* Animatsion fon */}
        <div className="animate-pred-glow pointer-events-none absolute -left-8 -top-8 h-40 w-40 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(235,75,75,0.25) 0%, transparent 68%)' }} />
        <div className="animate-pred-glow2 pointer-events-none absolute -bottom-4 -right-4 h-32 w-32 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(138,43,226,0.18) 0%, transparent 70%)' }} />

        <div style={slideStyle} className="relative px-4 pt-3 pb-2.5">
          {/* Header */}
          <div className="mb-2.5 flex items-center gap-2">
            <span className="flex items-center gap-1.5">
              <span className="animate-pred-dot inline-block h-2 w-2 rounded-full"
                style={{ background: '#eb4b4b', boxShadow: '0 0 6px #eb4b4b' }} />
              <span className="font-display text-[10px] font-bold uppercase tracking-widest" style={{ color: '#eb4b4b' }}>
                Прогноз точного счёта
              </span>
            </span>
            <span className="ml-auto rounded-full px-2 py-0.5 font-display text-[9px] font-bold"
              style={{ background: 'rgba(235,75,75,0.18)', color: '#ef8383', border: '1px solid rgba(235,75,75,0.28)' }}>
              LIVE
            </span>
          </div>

          {/* Jamoalar — asosiy blok */}
          {hasTeams ? (
            <div className="mb-2 flex items-center gap-2">
              {/* Jamoa A */}
              <div className="flex flex-1 flex-col items-center gap-1">
                <img
                  src={p.teamAImage || teamAPlaceholder}
                  alt={teamA}
                  onError={e => { e.target.src = teamAPlaceholder; }}
                  className="h-10 w-10 object-contain"
                />
                <span className="w-full truncate text-center font-display text-[13px] font-bold leading-tight"
                  style={{ color: 'rgba(255,255,255,0.92)' }}>
                  {teamA}
                </span>
              </div>

              {/* VS + Format */}
              <div className="flex shrink-0 flex-col items-center gap-0.5 px-1">
                <span className="font-display text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: 'rgba(255,255,255,0.35)' }}>vs</span>
                <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] font-bold"
                  style={{ color: 'rgba(255,255,255,0.5)' }}>{p.format}</span>
              </div>

              {/* Jamoa B */}
              <div className="flex flex-1 flex-col items-center gap-1">
                <img
                  src={p.teamBImage || teamBPlaceholder}
                  alt={teamB}
                  onError={e => { e.target.src = teamBPlaceholder; }}
                  className="h-10 w-10 object-contain"
                />
                <span className="w-full truncate text-center font-display text-[13px] font-bold leading-tight"
                  style={{ color: 'rgba(255,255,255,0.92)' }}>
                  {teamB}
                </span>
              </div>
            </div>
          ) : (
            /* Jamoalar yo'q bo'lsa — oddiy title */
            <p className="mb-2 font-display text-[15px] font-bold leading-snug"
              style={{ color: 'rgba(255,255,255,0.92)' }}>
              {p.title}
            </p>
          )}

          {/* Turnir nomi (title) + streamer */}
          <p className="mb-2 text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {p.title}{' '}
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>· стрим: {streamerTag}</span>
          </p>

          {/* Meta qator */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
              👥 {p._count?.entries ?? 0}
            </span>
            <span className="text-[10px]" style={{ color: remaining > 10 ? 'rgba(255,255,255,0.4)' : '#f5a623' }}>
              ⏱ {remaining > 0 ? `${remaining} мин.` : 'Скоро закрывается'}
            </span>
            {p.promoAmount > 0 && (
              <span className="ml-auto rounded-full px-2.5 py-0.5 font-display text-[10px] font-bold"
                style={{ background: 'rgba(235,75,75,0.18)', color: '#ef8383', border: '1px solid rgba(235,75,75,0.25)' }}>
                🏆 {Number(p.promoAmount).toLocaleString('ru-RU')} сум
              </span>
            )}
          </div>
        </div>

        {/* Dots */}
        {items.length > 1 && (
          <div className="relative flex justify-center gap-1.5 pb-2">
            {items.map((_, i) => (
              <button key={i}
                onClick={e => { e.stopPropagation(); goTo(i, i > current ? 'left' : 'right'); }}
                style={{
                  width: i === current ? 16 : 6, height: 4,
                  background: i === current ? '#eb4b4b' : 'rgba(255,255,255,0.18)',
                  border: 'none', borderRadius: 2, padding: 0,
                }}
              />
            ))}
          </div>
        )}
      </button>
    </div>
  );
}

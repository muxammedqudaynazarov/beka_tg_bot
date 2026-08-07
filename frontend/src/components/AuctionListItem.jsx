import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Heart } from 'lucide-react';
import RarityBadge from './RarityBadge';
import { RARITY_META, formatSom } from '../constants';
import { useCountdownDHMS } from '../hooks/useCountdown';
import { api } from '../api';
import { hapticNotification } from '../telegram';

export default function AuctionListItem({ auction }) {
  const navigate = useNavigate();
  const meta = RARITY_META[auction.rarity] || RARITY_META.CONSUMER;
  const countdown = useCountdownDHMS(auction.endsAt);
  const urgent = new Date(auction.endsAt).getTime() - Date.now() < 5 * 60 * 1000;
  const [favorited, setFavorited] = useState(Boolean(auction.isFavorited));

  async function toggleFavorite(e) {
    e.stopPropagation();
    const next = !favorited;
    setFavorited(next); // optimistik yangilash
    try {
      await api.post(`/favorites/${auction.id}`);
      hapticNotification('success');
    } catch {
      setFavorited(!next); // muvaffaqiyatsiz bo'lsa orqaga qaytaramiz
    }
  }

  return (
    <button
      onClick={() => navigate(`/auction/${auction.id}`)}
      className="flex w-full items-center gap-3 rounded-lg bg-base-surface px-2.5 py-2.5 text-left transition-transform active:scale-[0.99]"
      style={{
        borderLeft: `3px solid ${meta.color}`,
        backgroundImage: `linear-gradient(90deg, ${meta.color}14, transparent 45%)`,
      }}
    >
      <div className="relative h-14 w-14 shrink-0 rounded-md bg-base-surface2">
        <img
          src={auction.imageUrl}
          alt={auction.skinName}
          loading="lazy"
          className="h-full w-full object-contain p-1.5"
          style={{ filter: `drop-shadow(0 0 8px ${meta.color}33)` }}
        />
        {auction.isStatTrak && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 items-center gap-0.5 rounded-full border border-black/30 bg-gradient-to-br from-amber-400 to-orange-600 px-1.5 shadow-[0_2px_6px_rgba(0,0,0,0.4)]">
            <Zap size={9} className="text-black/75" fill="currentColor" />
            <span className="font-display text-[8px] font-black tracking-tight text-black/80">ST</span>
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-1.5">
          {/* Kamyoblik — RarityBadge O'ZINING rangida (auction.rarity, wearCondition EMAS) */}
          <RarityBadge rarity={auction.rarity} />
          {/* Format factory — alohida, barqaror (kamyoblikka bog'liq bo'lmagan) rangli belgi */}
          <span className="rounded bg-rarity-milspec/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-rarity-milspec">
            {auction.wearCondition}
          </span>
          <span className="truncate font-mono text-[10px] text-ink-muted">
            {Number(auction.floatValue).toFixed(4)}
          </span>
        </div>
        <h3 className="truncate font-display text-[13px] font-semibold leading-tight text-ink-primary">
          {auction.skinName}
        </h3>
        <p className="mt-0.5 font-mono text-[13px] font-bold" style={{ color: meta.color }}>
          {formatSom(auction.currentPrice)}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span
          role="button"
          tabIndex={0}
          onClick={toggleFavorite}
          onKeyDown={(e) => e.key === 'Enter' && toggleFavorite(e)}
          className="flex h-6 w-6 items-center justify-center rounded-full text-ink-muted active:scale-90"
        >
          <Heart size={15} className={favorited ? 'text-rarity-covert' : ''} fill={favorited ? 'currentColor' : 'none'} />
        </span>
        <div className="text-right">
          <p className="text-[9px] uppercase tracking-wide text-ink-muted">Осталось</p>
          <p className={`mt-0.5 font-mono text-[11px] font-medium tabular-nums ${urgent ? 'text-signal-danger' : 'text-ink-secondary'}`}>
            <span key={countdown} className="countdown-flash">{countdown}</span>
          </p>
        </div>
      </div>
    </button>
  );
}

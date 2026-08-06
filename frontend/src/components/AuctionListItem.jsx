import { useNavigate } from 'react-router-dom';
import { Zap } from 'lucide-react';
import RarityBadge from './RarityBadge';
import { RARITY_META, formatSom } from '../constants';
import { useCountdownDHMS } from '../hooks/useCountdown';

export default function AuctionListItem({ auction }) {
  const navigate = useNavigate();
  const meta = RARITY_META[auction.rarity] || RARITY_META.CONSUMER;
  const countdown = useCountdownDHMS(auction.endsAt);
  const urgent = new Date(auction.endsAt).getTime() - Date.now() < 5 * 60 * 1000;

  return (
    <button
      onClick={() => navigate(`/auction/${auction.id}`)}
      className="flex w-full items-center gap-3 rounded-lg bg-base-surface px-2.5 py-2.5 text-left active:scale-[0.99]"
      style={{ borderLeft: `3px solid ${meta.color}` }}
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
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-signal-warning text-black">
            <Zap size={9} fill="black" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-1.5">
          <RarityBadge rarity={auction.rarity} />
          <span className="truncate font-mono text-[10px] text-ink-muted">
            {auction.wearCondition} · {Number(auction.floatValue).toFixed(4)}
          </span>
        </div>
        <h3 className="truncate font-display text-[13px] font-semibold leading-tight text-ink-primary">
          {auction.skinName}
        </h3>
        <p className={`mt-0.5 font-mono text-[11px] font-medium tabular-nums ${urgent ? 'text-signal-danger' : 'text-ink-secondary'}`}>
          {countdown}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-[9px] uppercase tracking-wide text-ink-muted">Narx</p>
        <p className="font-mono text-[13px] font-bold text-ink-primary">{formatSom(auction.currentPrice)}</p>
      </div>
    </button>
  );
}

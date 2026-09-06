import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { api } from '../api';
import RarityBadge from '../components/RarityBadge';
import { RARITY_META, formatSom } from '../constants';

export default function PurchasedSkinsPage() {
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState(null);

  useEffect(() => {
    api.get('/profile').then(({ data }) => setPurchases(data.purchases || []));
  }, []);

  return (
    <div className="min-h-screen px-4 pb-10 pt-6">
      <header className="mb-5 flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="text-ink-secondary">
          <ChevronLeft size={20} />
        </button>
        <h1 className="font-display text-base font-bold text-ink-primary">Купленные скины</h1>
      </header>

      {purchases === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-base-surface" />)}
        </div>
      ) : purchases.length ? (
        <div className="space-y-2">
          {purchases.map((p) => {
            const a = p.auction;
            if (!a) return null;
            const meta = RARITY_META[a.rarity] || RARITY_META.CONSUMER;
            return (
              <button
                key={p.id}
                onClick={() => navigate(`/auction/${a.id}`)}
                className="flex w-full items-center gap-3 rounded-lg bg-base-surface px-2.5 py-2.5 text-left"
                style={{ borderLeft: `3px solid ${meta.color}`, backgroundImage: `linear-gradient(90deg, ${meta.color}14, transparent 45%)` }}
              >
                <div className="h-14 w-14 shrink-0 rounded-md bg-base-surface2">
                  <img src={a.imageUrl} alt={a.skinName} className="h-full w-full object-contain p-1.5" style={{ filter: `drop-shadow(0 0 8px ${meta.color}33)` }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-1.5">
                    <RarityBadge rarity={a.rarity} />
                    {a.wearCondition && (
                      <span className="rounded bg-rarity-milspec/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-rarity-milspec">
                        {a.wearCondition}
                      </span>
                    )}
                    {a.floatValue !== null && a.floatValue !== undefined && (
                      <span className="truncate font-mono text-[10px] text-ink-muted">{Number(a.floatValue).toFixed(4)}</span>
                    )}
                  </div>
                  <h3 className="truncate font-display text-[13px] font-semibold leading-tight text-ink-primary">{a.skinName}</h3>
                  <p className="mt-0.5 text-[10px] text-ink-muted">{new Date(p.createdAt).toLocaleDateString('ru-RU')}</p>
                </div>
                <p className="shrink-0 font-mono text-[13px] font-bold" style={{ color: meta.color }}>{formatSom(p.amount)}</p>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-ink-muted">Пока нет купленных скинов.</p>
      )}
    </div>
  );
}

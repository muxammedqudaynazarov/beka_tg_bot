import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame } from 'lucide-react';
import { api } from '../api';
import { RARITY_META, formatSom } from '../constants';

export default function LiveTicker() {
  const [items, setItems] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    api
      .get('/auctions/ending-strip')
      .then(({ data }) => !cancelled && setItems(data.items || []))
      .catch(() => {});
    const id = setInterval(() => {
      api.get('/auctions/ending-strip').then(({ data }) => !cancelled && setItems(data.items || [])).catch(() => {});
    }, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!items.length) return null;

  // Uzluksiz aylanish taassuroti uchun ro'yxatni ikki marta takrorlaymiz
  const loopItems = [...items, ...items];

  return (
    <div className="fixed inset-x-0 bottom-[60px] z-20 overflow-hidden border-t border-base-border bg-base-bg/95 py-1.5 backdrop-blur">
      <div className="flex w-max animate-marquee gap-6 px-3">
        {loopItems.map((item, idx) => {
          const meta = RARITY_META[item.rarity] || RARITY_META.CONSUMER;
          return (
            <button
              key={`${item.id}-${idx}`}
              onClick={() => navigate(`/auction/${item.id}`)}
              className="flex shrink-0 items-center gap-1.5 text-[11px]"
            >
              <Flame size={11} className="text-signal-danger" />
              <span style={{ color: meta.color }} className="font-display font-semibold">
                {item.skinName}
              </span>
              <span className="font-mono text-ink-secondary">{formatSom(item.currentPrice)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

import { RARITY_META } from '../constants';

export default function RarityBadge({ rarity, size = 'sm' }) {
  const meta = RARITY_META[rarity] || RARITY_META.CONSUMER;
  const sizeCls = size === 'sm' ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-display font-semibold uppercase tracking-wide ${sizeCls}`}
      style={{ color: meta.color, backgroundColor: `${meta.color}1A`, border: `1px solid ${meta.color}55` }}
    >
      {meta.label}
    </span>
  );
}

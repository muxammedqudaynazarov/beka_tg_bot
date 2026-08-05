import { Flame, Sparkles, SlidersHorizontal } from 'lucide-react';

const TABS = [
  { key: 'today', label: 'Bugun', icon: Flame },
  { key: 'new', label: 'Yangi', icon: Sparkles },
];

export default function TabPills({ active, onChange, onOpenFilter }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      {TABS.map(({ key, label, icon: Icon }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => onChange(isActive ? null : key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-display text-xs font-semibold transition-colors ${
              isActive
                ? 'bg-rarity-covert text-white'
                : 'bg-base-surface text-ink-secondary hover:text-ink-primary'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        );
      })}
      <button
        onClick={onOpenFilter}
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-base-surface px-3 py-1.5 font-display text-xs font-semibold text-ink-secondary hover:text-ink-primary"
      >
        <SlidersHorizontal size={13} />
        Filtr
      </button>
    </div>
  );
}

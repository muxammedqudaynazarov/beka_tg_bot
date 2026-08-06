import { Search } from 'lucide-react';

export default function SearchBar({ value, onChange }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-base-border bg-base-surface px-3 py-2">
      <Search size={16} className="shrink-0 text-ink-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Поиск по названию скина… (например, AK-47)"
        className="w-full bg-transparent font-body text-xs text-ink-primary placeholder:text-ink-muted focus:outline-none"
      />
    </div>
  );
}

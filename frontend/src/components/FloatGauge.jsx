// 11-band: rasmdagi kabi — format factory (float) qiymatini rangli shkala
// ustida ko'rsatadigan vizual komponent. Shkala CS2'ning haqiqiy wear-oralig'i
// chegaralariga mos: FN 0-0.07, MW 0.07-0.15, FT 0.15-0.38, WW 0.38-0.45,
// BS 0.45-1.

const ZONES = [
  { to: 0.07, color: '#2FB88A' },  // Factory New — yashil
  { to: 0.15, color: '#7FBF3E' },  // Minimal Wear — och yashil
  { to: 0.38, color: '#D8C233' },  // Field-Tested — sariq
  { to: 0.45, color: '#E08A33' },  // Well-Worn — to'q sariq
  { to: 1.00, color: '#D0483E' },  // Battle-Scarred — qizil
];

export default function FloatGauge({ value }) {
  const v = Math.min(Math.max(Number(value) || 0, 0), 1);
  const gradient = `linear-gradient(90deg, ${ZONES.map((z) => z.color).join(', ')})`;

  return (
    <div className="w-full">
      <div className="relative h-2 w-full rounded-full" style={{ background: gradient }}>
        <div
          className="absolute -top-1.5 h-5 w-5 -translate-x-1/2 rounded-full border-2 border-base-bg bg-white shadow-[0_1px_4px_rgba(0,0,0,0.5)]"
          style={{ left: `${v * 100}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="font-display text-xs font-semibold text-ink-secondary">Float</span>
        <span className="font-mono text-sm font-bold text-ink-primary">{v.toFixed(8)}</span>
      </div>
    </div>
  );
}

// 11-band (asl) + 2-band (yangi so'rov): rasmdagi kabi — format factory (float)
// qiymatini rangli shkala ustida ko'rsatadigan vizual komponent. Shkala CS2'ning
// haqiqiy wear-oralig'i chegaralariga mos: FN 0-0.07, MW 0.07-0.15, FT 0.15-0.38,
// WW 0.38-0.45, BS 0.45-1. Ranglar GRADIENT emas — har biri ANIQ, alohida bo'lak
// (qatlam qayerda tugab, qayerda boshlanishi ko'rinib tursin).

const ZONES = [
  { code: 'FN', from: 0, to: 0.07, color: '#2FB88A' },
  { code: 'MW', from: 0.07, to: 0.15, color: '#7FBF3E' },
  { code: 'FT', from: 0.15, to: 0.38, color: '#D8C233' },
  { code: 'WW', from: 0.38, to: 0.45, color: '#E08A33' },
  { code: 'BS', from: 0.45, to: 1.0, color: '#D0483E' },
];

export default function FloatGauge({ value }) {
  const v = Math.min(Math.max(Number(value) || 0, 0), 1);

  return (
    <div className="w-full">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full">
        {ZONES.map((z) => (
          <div
            key={z.code}
            style={{ width: `${(z.to - z.from) * 100}%`, backgroundColor: z.color }}
            className="h-full"
          />
        ))}
      </div>
      <div className="relative h-0">
        <div
          className="absolute -top-[15px] h-5 w-5 -translate-x-1/2 rounded-full border-2 border-base-bg bg-white shadow-[0_1px_4px_rgba(0,0,0,0.5)]"
          style={{ left: `${v * 100}%` }}
        />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="font-display text-xs font-semibold text-ink-secondary">Float</span>
        <span className="font-mono text-sm font-bold text-ink-primary">{v.toFixed(8)}</span>
      </div>
    </div>
  );
}

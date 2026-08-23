import { useEffect, useRef, useState } from 'react';
import { Gift, Clock, Copy, PartyPopper } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { showAlert, hapticNotification } from '../telegram';

const TYPE_LABELS = {
  TOPUP_BONUS_PROMO: '🎁 Бонус на пополнение',
  PAID_PROMO: '💰 Промокод на сумму',
  BOMB: '💣 Бомба',
  SKIN: '🔫 Скин',
  DISCOUNT_PROMO: '🏷 Скидка на лот',
};

// 2-band: segmentlarni navbat bilan bezash uchun ikki rang (referens
// rasmdagi kabi — to'q binafsha / yorqin apelsin uslubi)
const SEGMENT_COLORS = ['#3D1052', '#FF9F1C'];

function useCountdown(targetDate) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (!targetDate) return;
    function tick() {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) {
        setLabel('');
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLabel(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetDate]);
  return label;
}

export default function WheelPage() {
  const { refreshProfile } = useAuth();
  const [status, setStatus] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [rotation, setRotation] = useState(0);

  function load() {
    api.get('/wheel/status').then(({ data }) => setStatus(data));
  }
  useEffect(load, []);

  const countdown = useCountdown(status?.nextAvailableAt);
  const canSpin = status?.canSpin && !countdown;
  const items = status?.items || [];
  const segmentAngle = items.length ? 360 / items.length : 0;

  const wheelBackground = items.length
    ? `conic-gradient(from 0deg, ${items
        .map((_, i) => {
          const color = SEGMENT_COLORS[i % 2];
          return `${color} ${i * segmentAngle}deg ${(i + 1) * segmentAngle}deg`;
        })
        .join(', ')})`
    : '#3D1052';

  async function spin() {
    if (spinning || !canSpin) return;
    setSpinning(true);
    setResult(null);

    try {
      const { data } = await api.post('/wheel/spin');
      const won = data.result;

      const wonIndex = items.findIndex((it) => it.id === won.wheelItemId);
      const targetMidAngle = wonIndex >= 0 ? wonIndex * segmentAngle + segmentAngle / 2 : 0;
      // Segment ichida ozgina tasodifiy joy (haddan tashqari markazga tushib qolmasligi uchun)
      const jitterDeg = (Math.random() - 0.5) * (segmentAngle * 0.6);
      const targetAngle = targetMidAngle + jitterDeg;

      // G'ildirak HAR DOIM OLDINGA aylanishi (hech qachon orqaga "sakramasligi")
      // va aynan shu segment tepada (ko'rsatkichda) to'xtashi uchun aniq hisob-kitob:
      const currentEffective = ((rotation % 360) + 360) % 360;
      const desiredEffective = ((-targetAngle % 360) + 360) % 360;
      let delta = desiredEffective - currentEffective;
      if (delta <= 0) delta += 360;
      const extraFullSpins = 6;
      const finalRotation = rotation + delta + extraFullSpins * 360;

      setRotation(finalRotation);

      setTimeout(async () => {
        setResult(won);
        setSpinning(false);
        hapticNotification(won.type === 'BOMB' ? 'error' : 'success');
        load();
        await refreshProfile();
      }, 4200);
    } catch (err) {
      setSpinning(false);
      hapticNotification('error');
      showAlert(err.response?.data?.error || 'Не удалось прокрутить барабан.');
      load();
    }
  }

  async function copyCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      showAlert('📋 Код скопирован: ' + code);
    } catch {
      showAlert('Код: ' + code);
    }
  }

  if (status === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-rarity-covert border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 pb-28 pt-6 text-center">
      <h1 className="mb-1 font-display text-base font-bold text-ink-primary">Барабан удачи</h1>
      <p className="mb-6 text-xs text-ink-secondary">Крутите раз в 24 часа и выигрывайте призы!</p>

      <div className="relative mx-auto mb-6 flex h-64 w-64 items-center justify-center">
        <div className="absolute -top-1 left-1/2 z-20 h-0 w-0 -translate-x-1/2 border-l-[12px] border-r-[12px] border-t-[20px] border-l-transparent border-r-transparent border-t-yellow-400 drop-shadow" />

        <button
          onClick={spin}
          disabled={spinning || !canSpin}
          className="relative h-60 w-60 rounded-full border-[6px] border-yellow-400/80 shadow-[0_0_50px_rgba(255,159,28,0.35)] disabled:cursor-not-allowed"
        >
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: wheelBackground,
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? 'transform 4.1s cubic-bezier(0.12, 0.72, 0.15, 1)' : 'none',
            }}
          >
            {items.map((it, i) => {
              const angle = i * segmentAngle + segmentAngle / 2;
              return (
                <div key={it.id} className="absolute inset-0" style={{ transform: `rotate(${angle}deg)` }}>
                  <div className="absolute left-1/2 top-4 -translate-x-1/2">
                    <Gift size={22} className="text-white drop-shadow" strokeWidth={2} />
                  </div>
                </div>
              );
            })}
            {items.map((_, i) => (
              <div
                key={`line-${i}`}
                className="absolute left-1/2 top-1/2 h-1/2 w-px origin-top bg-black/20"
                style={{ transform: `rotate(${i * segmentAngle}deg)` }}
              />
            ))}
          </div>

          <div className="absolute left-1/2 top-1/2 z-10 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-4 border-base-surface bg-gradient-to-br from-yellow-400 to-orange-500 shadow-lg">
            <span className="font-display text-[9px] font-bold leading-tight text-black">
              {spinning ? '...' : canSpin ? 'Крутить' : '⏳'}
            </span>
          </div>
        </button>
      </div>

      {countdown && (
        <div className="mx-auto mb-4 flex max-w-xs items-center justify-center gap-2 rounded-xl bg-base-surface px-4 py-3">
          <Clock size={16} className="text-signal-warning" />
          <div className="text-left">
            <p className="text-[11px] text-ink-secondary">Следующее вращение через</p>
            <p className="font-mono text-sm font-bold text-signal-warning">{countdown}</p>
          </div>
        </div>
      )}
      {!countdown && !spinning && !result && (
        <p className="mb-4 text-[11px] text-ink-muted">Нажмите на барабан, чтобы крутить</p>
      )}

      {result && (
        <div className="mx-auto max-w-xs rounded-2xl bg-base-surface p-4">
          {result.type === 'BOMB' ? (
            <>
              <p className="text-2xl">💣</p>
              <p className="mt-1 font-display text-sm font-bold text-ink-primary">Не повезло!</p>
              <p className="mt-0.5 text-xs text-ink-secondary">Попробуйте снова через 24 часа.</p>
            </>
          ) : (
            <>
              <PartyPopper size={28} className="mx-auto text-signal-warning" />
              <p className="mt-1 font-display text-sm font-bold text-ink-primary">{result.label}</p>
              <p className="mt-0.5 text-[11px] text-ink-secondary">{TYPE_LABELS[result.type]}</p>
              {result.promoCode && (
                <button
                  onClick={() => copyCode(result.promoCode)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-rarity-covert bg-rarity-covert/10 px-3 py-2 font-mono text-sm font-bold tracking-widest text-rarity-covert"
                >
                  {result.promoCode} <Copy size={14} />
                </button>
              )}
              {result.promoCode && (
                <p className="mt-1.5 text-[10px] text-ink-secondary">
                  Активируйте код в разделе «Промокод» в течение 24 часов
                </p>
              )}
              {result.auctionId && (
                <p className="mt-1.5 text-[10px] text-ink-secondary">
                  Скин уже у вас — заберите его в разделе «Профиль»
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

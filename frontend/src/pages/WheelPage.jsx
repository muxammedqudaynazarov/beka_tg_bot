import { useEffect, useRef, useState } from 'react';
import { Dices, Clock, Copy, PartyPopper } from 'lucide-react';
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
  const wheelRef = useRef(null);

  function load() {
    api.get('/wheel/status').then(({ data }) => setStatus(data));
  }
  useEffect(load, []);

  const countdown = useCountdown(status?.nextAvailableAt);
  const canSpin = status?.canSpin && !countdown;

  async function spin() {
    setSpinning(true);
    setResult(null);
    if (wheelRef.current) {
      wheelRef.current.style.transition = 'none';
      wheelRef.current.style.transform = 'rotate(0deg)';
      void wheelRef.current.offsetHeight;
      wheelRef.current.style.transition = 'transform 3.2s cubic-bezier(0.15, 0.85, 0.25, 1)';
      const extraSpins = 5 + Math.floor(Math.random() * 3);
      wheelRef.current.style.transform = `rotate(${extraSpins * 360 + Math.floor(Math.random() * 360)}deg)`;
    }

    try {
      const { data } = await api.post('/wheel/spin');
      setTimeout(async () => {
        setResult(data.result);
        setSpinning(false);
        hapticNotification(data.result.type === 'BOMB' ? 'error' : 'success');
        load();
        await refreshProfile();
      }, 3300);
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

      <div className="relative mx-auto mb-6 flex h-56 w-56 items-center justify-center">
        <div className="absolute -top-1 left-1/2 z-10 h-0 w-0 -translate-x-1/2 border-l-[10px] border-r-[10px] border-t-[16px] border-l-transparent border-r-transparent border-t-rarity-covert" />
        <div
          ref={wheelRef}
          className="flex h-52 w-52 items-center justify-center rounded-full border-8 border-base-surface bg-gradient-to-br from-rarity-covert via-rarity-classified to-rarity-restricted shadow-[0_0_40px_rgba(235,75,75,0.35)]"
        >
          <Dices size={64} className="text-white/90" strokeWidth={1.5} />
        </div>
      </div>

      {countdown ? (
        <div className="mx-auto mb-4 flex max-w-xs items-center justify-center gap-2 rounded-xl bg-base-surface px-4 py-3">
          <Clock size={16} className="text-signal-warning" />
          <div className="text-left">
            <p className="text-[11px] text-ink-secondary">Следующее вращение через</p>
            <p className="font-mono text-sm font-bold text-signal-warning">{countdown}</p>
          </div>
        </div>
      ) : (
        <button
          onClick={spin}
          disabled={spinning || !canSpin}
          className="mx-auto mb-4 block rounded-full bg-gradient-to-r from-rarity-covert to-rarity-classified px-10 py-3 font-display text-sm font-bold text-white shadow-lg disabled:opacity-50"
        >
          {spinning ? 'Крутится…' : 'Крутить барабан'}
        </button>
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

      {status.items?.length > 0 && !result && (
        <div className="mx-auto mt-2 max-w-xs space-y-1.5 text-left">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Возможные призы</p>
          {status.items.map((it) => (
            <div key={it.id} className="flex items-center justify-between rounded-lg bg-base-surface px-3 py-1.5 text-xs">
              <span className="text-ink-primary">{it.label}</span>
              <span className="text-[10px] text-ink-muted">{TYPE_LABELS[it.type]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

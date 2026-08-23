import { useEffect, useState } from 'react';
import { Tag, Copy, Clock } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { showAlert, hapticNotification } from '../telegram';

function useTimeLeft(expiresAt) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    function tick() {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) return setLabel('истёк');
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setLabel(`${h}ч ${m}мин`);
    }
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return label;
}

function WheelCodeRow({ item, onUsed }) {
  const timeLeft = useTimeLeft(item.expiresAt);
  async function copy() {
    try {
      await navigator.clipboard.writeText(item.code);
      showAlert('📋 Скопировано: ' + item.code);
    } catch {
      showAlert('Код: ' + item.code);
    }
  }
  return (
    <div className="flex items-center justify-between rounded-lg border border-dashed border-rarity-covert/40 bg-rarity-covert/5 px-3 py-2">
      <div>
        <button onClick={copy} className="flex items-center gap-1.5 font-mono text-sm font-bold tracking-widest text-rarity-covert">
          {item.code} <Copy size={12} />
        </button>
        <p className="mt-0.5 flex items-center gap-1 text-[10px] text-ink-secondary">
          <Clock size={10} /> Выигрыш барабана · осталось {timeLeft}
        </p>
      </div>
    </div>
  );
}

// 2-band: promo-kod kiritish bo'limi — ko'rinadigan joyda (Платежи
// bo'limi yuqorisida) bo'lishi uchun alohida komponent. 4.e-band: bunga
// qo'shimcha, Барабан orqali yutib olingan, hali ishlatilmagan kodlar
// ro'yxati ham shu yerda ko'rsatiladi.
export default function PromoCodeSection() {
  const { refreshProfile } = useAuth();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [wheelCodes, setWheelCodes] = useState(null);

  function loadWheelCodes() {
    api.get('/promo/my-wheel-codes').then(({ data }) => setWheelCodes(data.items || []));
  }
  useEffect(loadWheelCodes, []);

  async function redeem(codeOverride) {
    const target = codeOverride || code;
    if (!target.trim()) return;
    setSubmitting(true);
    try {
      const { data } = await api.post('/promo/redeem', { code: target.trim() });
      hapticNotification('success');
      showAlert(data.message);
      setCode('');
      loadWheelCodes();
      await refreshProfile();
    } catch (err) {
      hapticNotification('error');
      showAlert(err.response?.data?.error || 'Не удалось активировать промо-код.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mb-6 rounded-2xl bg-gradient-to-br from-base-surface to-base-surface2 p-4 shadow-glow">
      <h2 className="mb-2 flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wide text-ink-secondary">
        <Tag size={14} className="text-rarity-covert" /> У вас есть промокод?
      </h2>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Введите код"
          className="w-full rounded-lg border border-base-border bg-base-bg px-3 py-2.5 text-sm font-semibold uppercase tracking-wide text-ink-primary placeholder:text-ink-muted placeholder:tracking-normal placeholder:font-normal focus:border-rarity-covert focus:outline-none"
        />
        <button
          onClick={() => redeem()}
          disabled={submitting || !code.trim()}
          className="shrink-0 rounded-lg bg-rarity-covert px-5 py-2.5 font-display text-xs font-bold text-white disabled:opacity-50"
        >
          {submitting ? '…' : 'Ок'}
        </button>
      </div>

      {wheelCodes?.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Ваши выигрыши барабана</p>
          {wheelCodes.map((w) => (
            <div key={w.id} onClick={() => redeem(w.code)} className="cursor-pointer">
              <WheelCodeRow item={w} onUsed={loadWheelCodes} />
            </div>
          ))}
          <p className="text-[10px] text-ink-muted">Нажмите на код, чтобы сразу активировать его.</p>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Wallet, Lock, Clock3, RefreshCw } from 'lucide-react';
import { api } from '../api';
import AdBanner from '../components/AdBanner';
import PromoCodeSection from '../components/PromoCodeSection';
import { useAuth } from '../AuthContext';
import { openLink, showAlert, hapticNotification } from '../telegram';
import { formatSom } from '../constants';

const QUICK_AMOUNTS = [50000, 100000, 250000, 500000];

function PendingPaymentRow({ tx, onResolved }) {
  const [checking, setChecking] = useState(false);

  async function checkStatus() {
    setChecking(true);
    try {
      const { data } = await api.post(`/payments/${tx.id}/check-status`);
      if (data.status === 'SUCCESS') {
        hapticNotification('success');
        showAlert('✅ Платёж подтверждён, баланс пополнен.');
        onResolved();
      } else {
        showAlert(data.message || 'Платёж пока не поступил.');
      }
    } catch (err) {
      showAlert(err.response?.data?.error || 'Ошибка при проверке.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex items-center justify-between rounded-xl bg-base-surface px-3.5 py-3">
      <div>
        <p className="flex items-center gap-1.5 font-mono text-sm font-semibold text-ink-primary">
          <Clock3 size={13} className="text-signal-warning" />
          {formatSom(tx.amount)}
        </p>
        <p className="text-[10px] text-ink-muted">{new Date(tx.createdAt).toLocaleString('ru-RU')}</p>
      </div>
      <button
        onClick={checkStatus}
        disabled={checking}
        className="flex items-center gap-1.5 rounded-lg bg-base-surface2 px-3 py-1.5 text-xs font-semibold text-ink-primary disabled:opacity-50"
      >
        <RefreshCw size={12} className={checking ? 'animate-spin' : ''} />
        {checking ? 'Проверка…' : 'Проверить'}
      </button>
    </div>
  );
}

export default function PaymentPage() {
  const { user, refreshProfile } = useAuth();
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState(null);
  const [bonus, setBonus] = useState(null);

  function loadPending() {
    api.get('/payments/pending').then(({ data }) => setPending(data.items || []));
  }
  useEffect(loadPending, []);
  // 4-band: agar foydalanuvchi FIRST_DEPOSIT_BONUS promo-kodini
  // faollashtirgan bo'lsa va hali birinchi to'lovini qilmagan bo'lsa —
  // shu haqda eslatma bannerini ko'rsatamiz.
  useEffect(() => {
    api.get('/promo/active-first-deposit-bonus').then(({ data }) => setBonus(data.bonus));
  }, []);

  async function handleTopup() {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      showAlert('Пожалуйста, введите корректную сумму.');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post('/payments/topup', { amount: numericAmount });
      hapticNotification('success');
      openLink(data.checkoutUrl);
      loadPending();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Произошла ошибка. Попробуйте ещё раз.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResolved() {
    await refreshProfile();
    loadPending();
  }

  return (
    <div className="min-h-screen px-4 pb-28 pt-6">
      <PromoCodeSection />
      <h1 className="mb-1 font-display text-base font-bold text-ink-primary">Пополнение</h1>
      <AdBanner />
      <p className="mb-5 text-xs text-ink-secondary">Пополните баланс, чтобы участвовать в аукционах.</p>

      {bonus && (
        <div className="mb-5 rounded-xl border border-signal-success/40 bg-signal-success/10 px-3.5 py-3">
          <p className="font-display text-xs font-bold text-signal-success">
            🎁 Активирован бонус +{bonus.percent}% на первое пополнение!
          </p>
          <p className="mt-0.5 text-[11px] text-ink-secondary">
            Бонус автоматически добавится к балансу сразу после первого успешного пополнения.
          </p>
        </div>
      )}

      <div className="mb-6 rounded-2xl bg-gradient-to-br from-base-surface to-base-surface2 p-4 shadow-glow">
        <div className="flex items-center gap-2 text-ink-secondary">
          <Wallet size={14} />
          <span className="text-[10px] uppercase tracking-wide">Текущий баланс</span>
        </div>
        <p className="mt-1 font-mono text-2xl font-bold text-ink-primary">{formatSom(user?.balance)}</p>
        {Number(user?.holdBalance) > 0 && (
          <p className="mt-1 text-[11px] text-ink-muted">
            <Lock size={10} className="mr-1 inline" />
            {formatSom(user.holdBalance)} заблокировано как залог на аукционах
          </p>
        )}
      </div>

      {pending && pending.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-ink-secondary">
            Незавершённые платежи
          </h2>
          <div className="space-y-2">
            {pending.map((tx) => (
              <PendingPaymentRow key={tx.id} tx={tx} onResolved={handleResolved} />
            ))}
          </div>
          <p className="mt-2 text-[10px] text-ink-muted">
            Если вы уже оплатили через Click, но баланс не обновился — нажмите «Проверить».
          </p>
        </div>
      )}

      <label className="mb-2 block font-display text-xs font-semibold text-ink-secondary">Сумма пополнения</label>
      <input
        type="number"
        inputMode="numeric"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Например: 200000"
        className="mb-3 w-full rounded-xl border border-base-border bg-base-surface px-4 py-2.5 font-mono text-sm text-ink-primary placeholder:text-ink-muted focus:border-rarity-covert focus:outline-none"
      />
      <div className="mb-6 flex flex-wrap gap-2">
        {QUICK_AMOUNTS.map((v) => (
          <button
            key={v}
            onClick={() => setAmount(String(v))}
            className="rounded-full bg-base-surface px-3 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink-primary"
          >
            {formatSom(v)}
          </button>
        ))}
      </div>

      <button
        onClick={handleTopup}
        disabled={submitting}
        className="w-full rounded-xl bg-rarity-covert py-3 font-display text-sm font-bold text-white shadow-glow transition-opacity disabled:opacity-50"
      >
        {submitting ? 'Загрузка…' : 'Пополнить'}
      </button>
      <p className="mt-3 text-center text-[10px] text-ink-muted">
        Вы будете перенаправлены на официальную защищённую страницу оплаты Click.
      </p>
    </div>
  );
}

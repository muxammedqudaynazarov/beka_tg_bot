import { useEffect, useState } from 'react';
import { Wallet, Lock, Clock3, RefreshCw } from 'lucide-react';
import { api } from '../api';
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
        showAlert('✅ To\'lov tasdiqlandi, balansingiz oshirildi.');
        onResolved();
      } else {
        showAlert(data.message || 'Hali to\'lanmagan.');
      }
    } catch (err) {
      showAlert(err.response?.data?.error || 'Tekshirishda xatolik yuz berdi.');
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
        <p className="text-[10px] text-ink-muted">{new Date(tx.createdAt).toLocaleString('uz-UZ')}</p>
      </div>
      <button
        onClick={checkStatus}
        disabled={checking}
        className="flex items-center gap-1.5 rounded-lg bg-base-surface2 px-3 py-1.5 text-xs font-semibold text-ink-primary disabled:opacity-50"
      >
        <RefreshCw size={12} className={checking ? 'animate-spin' : ''} />
        {checking ? 'Tekshirilmoqda…' : 'Tekshirish'}
      </button>
    </div>
  );
}

export default function PaymentPage() {
  const { user, refreshProfile } = useAuth();
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState(null); // null = hali yuklanmoqda

  function loadPending() {
    api.get('/payments/pending').then(({ data }) => setPending(data.items || []));
  }
  useEffect(loadPending, []);

  async function handleTopup() {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      showAlert('Iltimos, to\'g\'ri summa kiriting.');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post('/payments/topup', { amount: numeric });
      hapticNotification('success');
      openLink(data.checkoutUrl);
      loadPending();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Xatolik yuz berdi. Qayta urinib ko\'ring.');
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
      <h1 className="mb-1 font-display text-base font-bold text-ink-primary">To'lov</h1>
      <p className="mb-5 text-xs text-ink-secondary">Hisobingizni Click orqali to'ldiring va auksionlarda qatnashing.</p>

      <div className="mb-6 rounded-2xl bg-gradient-to-br from-base-surface to-base-surface2 p-4 shadow-glow">
        <div className="flex items-center gap-2 text-ink-secondary">
          <Wallet size={14} />
          <span className="text-[10px] uppercase tracking-wide">Joriy balans</span>
        </div>
        <p className="mt-1 font-mono text-2xl font-bold text-ink-primary">{formatSom(user?.balance)}</p>
        {Number(user?.holdBalance) > 0 && (
          <p className="mt-1 text-[11px] text-ink-muted">
            <Lock size={10} className="mr-1 inline" />
            {formatSom(user.holdBalance)} auksion(lar)da zaklad sifatida band
          </p>
        )}
      </div>

      {pending && pending.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-ink-secondary">
            Yakunlanmagan to'lovlar
          </h2>
          <div className="space-y-2">
            {pending.map((tx) => (
              <PendingPaymentRow key={tx.id} tx={tx} onResolved={handleResolved} />
            ))}
          </div>
          <p className="mt-2 text-[10px] text-ink-muted">
            Click orqali to'lovni yakunlagan bo'lsangiz-u, balans hali oshmagan bo'lsa — "Tekshirish" tugmasini bosing.
          </p>
        </div>
      )}

      <label className="mb-2 block font-display text-xs font-semibold text-ink-secondary">To'ldirish summasi</label>
      <input
        type="number"
        inputMode="numeric"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Masalan: 200000"
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
        {submitting ? 'Yuklanmoqda…' : 'To\'ldirish'}
      </button>
      <p className="mt-3 text-center text-[10px] text-ink-muted">To'lov Click.uz xavfsiz tizimi orqali amalga oshiriladi.</p>
    </div>
  );
}

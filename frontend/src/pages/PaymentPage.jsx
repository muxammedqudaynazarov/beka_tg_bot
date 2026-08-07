import { useEffect, useState } from 'react';
import { Wallet, Lock, Clock3, RefreshCw, ShieldCheck, CreditCard, ExternalLink } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { openLink, showAlert, hapticNotification } from '../telegram';
import { formatSom } from '../constants';

const QUICK_AMOUNTS = [50000, 100000, 250000, 500000];

function formatCardNumber(value) {
  const digits = value.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

function formatExpiry(value) {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

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

// Карта напрямую: 1) номер карты + срок -> код на телефон, 2) код из SMS -> оплата
function CardPaymentFlow({ amount, onSuccess }) {
  const [step, setStep] = useState('card'); // card | sms
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cardToken, setCardToken] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function requestToken() {
    const digits = cardNumber.replace(/\D/g, '');
    const expDigits = expiry.replace(/\D/g, '');
    if (digits.length !== 16) return showAlert('Введите полный номер карты (16 цифр).');
    if (expDigits.length !== 4) return showAlert('Введите срок действия карты (ММ/ГГ).');
    setLoading(true);
    try {
      const { data } = await api.post('/payments/card/request-token', { cardNumber: digits, expireDate: expDigits });
      setCardToken(data.cardToken);
      setMaskedPhone(data.maskedPhone);
      setStep('sms');
      hapticNotification('success');
    } catch (err) {
      showAlert(err.response?.data?.error || 'Не удалось проверить карту.');
    } finally {
      setLoading(false);
    }
  }

  async function confirmAndPay() {
    if (!smsCode.trim()) return showAlert('Введите код из SMS.');
    if (!amount || amount <= 0) return showAlert('Сначала укажите сумму пополнения выше.');
    setLoading(true);
    try {
      await api.post('/payments/card/verify-token', { cardToken, smsCode: smsCode.trim() });
      const { data } = await api.post('/payments/card/pay', { cardToken, amount });
      hapticNotification('success');
      showAlert(data.message || 'Готово.');
      if (data.status === 'SUCCESS') onSuccess();
      setStep('card');
      setCardNumber('');
      setExpiry('');
      setSmsCode('');
    } catch (err) {
      showAlert(err.response?.data?.error || 'Не удалось завершить оплату.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-base-border p-4">
      <div className="flex items-start gap-2 rounded-lg bg-signal-success/10 px-3 py-2 text-[11px] text-signal-success">
        <ShieldCheck size={14} className="mt-0.5 shrink-0" />
        Номер карты передаётся напрямую в платёжную систему Click и никогда не сохраняется в нашей базе данных.
      </div>

      {step === 'card' ? (
        <>
          <input
            value={cardNumber}
            onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
            inputMode="numeric"
            placeholder="0000 0000 0000 0000"
            className="w-full rounded-xl border border-base-border bg-base-surface px-4 py-2.5 font-mono text-sm tracking-wider text-ink-primary placeholder:text-ink-muted focus:border-rarity-covert focus:outline-none"
          />
          <input
            value={expiry}
            onChange={(e) => setExpiry(formatExpiry(e.target.value))}
            inputMode="numeric"
            placeholder="ММ/ГГ"
            className="w-32 rounded-xl border border-base-border bg-base-surface px-4 py-2.5 font-mono text-sm text-ink-primary placeholder:text-ink-muted focus:border-rarity-covert focus:outline-none"
          />
          <button
            onClick={requestToken}
            disabled={loading}
            className="w-full rounded-xl bg-base-surface2 py-3 font-display text-sm font-bold text-ink-primary disabled:opacity-50"
          >
            {loading ? 'Проверка…' : 'Получить код подтверждения'}
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-ink-secondary">
            Код отправлен на номер <span className="font-mono text-ink-primary">{maskedPhone}</span>
          </p>
          <input
            value={smsCode}
            onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder="Код из SMS"
            className="w-full rounded-xl border border-base-border bg-base-surface px-4 py-2.5 font-mono text-sm tracking-widest text-ink-primary placeholder:text-ink-muted focus:border-rarity-covert focus:outline-none"
          />
          <button
            onClick={confirmAndPay}
            disabled={loading}
            className="w-full rounded-xl bg-rarity-covert py-3 font-display text-sm font-bold text-white disabled:opacity-50"
          >
            {loading ? 'Оплата…' : `Подтвердить и оплатить ${formatSom(amount)}`}
          </button>
          <button onClick={() => setStep('card')} className="w-full text-center text-[11px] text-ink-muted">
            Изменить номер карты
          </button>
        </>
      )}
    </div>
  );
}

export default function PaymentPage() {
  const { user, refreshProfile } = useAuth();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('click'); // click | card
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState(null);

  function loadPending() {
    api.get('/payments/pending').then(({ data }) => setPending(data.items || []));
  }
  useEffect(loadPending, []);

  const numericAmount = Number(amount) || 0;

  async function handleClickTopup() {
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
      <h1 className="mb-1 font-display text-base font-bold text-ink-primary">Пополнение</h1>
      <p className="mb-5 text-xs text-ink-secondary">Пополните баланс, чтобы участвовать в аукционах.</p>

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

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setMethod('click')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold ${
            method === 'click' ? 'bg-rarity-covert text-white' : 'bg-base-surface text-ink-secondary'
          }`}
        >
          <ExternalLink size={13} /> Через Click
        </button>
        <button
          onClick={() => setMethod('card')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold ${
            method === 'card' ? 'bg-rarity-covert text-white' : 'bg-base-surface text-ink-secondary'
          }`}
        >
          <CreditCard size={13} /> Картой напрямую
        </button>
      </div>

      {method === 'click' ? (
        <>
          <button
            onClick={handleClickTopup}
            disabled={submitting}
            className="w-full rounded-xl bg-rarity-covert py-3 font-display text-sm font-bold text-white shadow-glow transition-opacity disabled:opacity-50"
          >
            {submitting ? 'Загрузка…' : 'Пополнить'}
          </button>
          <p className="mt-3 text-center text-[10px] text-ink-muted">
            Вы будете перенаправлены на официальную защищённую страницу оплаты Click.
          </p>
        </>
      ) : (
        <CardPaymentFlow amount={numericAmount} onSuccess={handleResolved} />
      )}
    </div>
  );
}

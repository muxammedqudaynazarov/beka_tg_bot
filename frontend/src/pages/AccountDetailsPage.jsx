import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, CreditCard, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { api } from '../api';
import { showAlert, hapticNotification } from '../telegram';
import { formatSom } from '../constants';

function formatCardInput(value) {
  const digits = value.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

export default function AccountDetailsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [cardInput, setCardInput] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    api.get('/profile/finance').then(({ data }) => setData(data));
  }
  useEffect(load, []);

  async function saveCard() {
    const digits = cardInput.replace(/\D/g, '');
    if (digits.length !== 16) {
      showAlert('Введите полный номер карты (16 цифр).');
      return;
    }
    setSaving(true);
    try {
      await api.patch('/profile/card', { cardNumber: digits });
      hapticNotification('success');
      showAlert('✅ Карта сохранена.');
      setCardInput('');
      load();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Ошибка при сохранении.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen pb-10">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-base-border bg-base-bg/95 px-4 py-3.5 backdrop-blur">
        <button onClick={() => navigate(-1)} className="text-ink-secondary">
          <ChevronLeft size={20} />
        </button>
        <h1 className="font-display text-base font-bold text-ink-primary">Мои финансы</h1>
      </header>

      <main className="space-y-6 px-4 pt-5">
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wide text-ink-secondary">
            <CreditCard size={13} /> Карта для выплат
          </h2>
          {data?.cardNumberMasked && (
            <div className="mb-2 rounded-xl bg-base-surface px-3.5 py-3">
              <p className="text-[10px] text-ink-muted">Текущая карта</p>
              <p className="mt-0.5 font-mono text-sm font-bold text-ink-primary">{data.cardNumberMasked}</p>
            </div>
          )}
          <input
            value={cardInput}
            onChange={(e) => setCardInput(formatCardInput(e.target.value))}
            inputMode="numeric"
            placeholder="0000 0000 0000 0000"
            className="mb-2 w-full rounded-xl border border-base-border bg-base-surface px-4 py-2.5 font-mono text-sm tracking-wider text-ink-primary placeholder:text-ink-muted focus:border-rarity-covert focus:outline-none"
          />
          <button
            onClick={saveCard}
            disabled={saving}
            className="w-full rounded-xl bg-rarity-covert py-2.5 font-display text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Сохранение…' : 'Сохранить карту'}
          </button>
          <p className="mt-2 text-[10px] text-ink-muted">
            Карта используется только для будущих выплат за проданные скины. Пополнение баланса всегда происходит через Click.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-ink-secondary">Аналитика</h2>
          {!data ? (
            <div className="grid grid-cols-2 gap-3">
              {[0, 1].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-base-surface" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-base-surface p-3.5">
                <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-ink-secondary">
                  <ArrowDownCircle size={11} className="text-signal-success" /> Пополнено
                </div>
                <p className="font-mono text-sm font-bold text-signal-success">{formatSom(data.totalDeposited)}</p>
              </div>
              <div className="rounded-xl bg-base-surface p-3.5">
                <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-ink-secondary">
                  <ArrowUpCircle size={11} className="text-ink-secondary" /> Получено
                </div>
                <p className="font-mono text-sm font-bold text-ink-primary">{formatSom(data.totalReceived)}</p>
              </div>
            </div>
          )}
          <p className="mt-2 text-[10px] text-ink-muted">
            «Получено» — суммы за проданные скины (функция продажи скинов появится позже).
          </p>
        </section>
      </main>
    </div>
  );
}

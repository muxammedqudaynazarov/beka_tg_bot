import { useState } from 'react';
import { Tag } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { showAlert, hapticNotification } from '../telegram';

// 2-band: promo-kod kiritish bo'limi — ko'rinadigan joyda (Платежи
// bo'limi yuqorisida) bo'lishi uchun alohida, qayta ishlatiladigan
// komponent qilib chiqarildi. Natija turi (skidka/pul/bonus) backend'da
// avtomatik hal qilinadi, bu yerda faqat natija xabari ko'rsatiladi.
export default function PromoCodeSection() {
  const { refreshProfile } = useAuth();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function redeem() {
    if (!code.trim()) return;
    setSubmitting(true);
    try {
      const { data } = await api.post('/promo/redeem', { code: code.trim() });
      hapticNotification('success');
      showAlert(data.message);
      setCode('');
      await refreshProfile();
    } catch (err) {
      hapticNotification('error');
      showAlert(err.response?.data?.error || 'Не удалось активировать промо-код.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mb-6 rounded-xl bg-base-surface p-3.5">
      <h2 className="mb-2 flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wide text-ink-secondary">
        <Tag size={13} /> Промокод
      </h2>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Введите код"
          className="w-full rounded-lg border border-base-border bg-base-bg px-3 py-2 text-xs uppercase text-ink-primary placeholder:text-ink-muted focus:border-rarity-covert focus:outline-none"
        />
        <button
          onClick={redeem}
          disabled={submitting || !code.trim()}
          className="shrink-0 rounded-lg bg-rarity-covert px-4 py-2 font-display text-xs font-bold text-white disabled:opacity-50"
        >
          {submitting ? '…' : 'Ок'}
        </button>
      </div>
    </div>
  );
}

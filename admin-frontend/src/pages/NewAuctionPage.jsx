import { useEffect, useState } from 'react';
import { api } from '../api';
import { showAlert } from '../telegram';

const RARITIES = [
  { v: 'CONSUMER', l: 'Oq (Consumer)' },
  { v: 'INDUSTRIAL', l: "Ochiq ko'k (Industrial)" },
  { v: 'MILSPEC', l: "Ko'k (Mil-Spec)" },
  { v: 'RESTRICTED', l: 'Fiolet (Restricted)' },
  { v: 'CLASSIFIED', l: 'Pushti (Classified)' },
  { v: 'COVERT', l: 'Qizil (Covert)' },
  { v: 'GOLD', l: "Oltin (Pichoq/Qo'lqop)" },
];
const WEARS = ['FN', 'MW', 'FT', 'WW', 'BS'];

const EMPTY = {
  skinName: '',
  imageUrl: '',
  categoryId: '',
  rarity: 'MILSPEC',
  floatValue: '',
  wearCondition: 'FT',
  isStatTrak: false,
  startPrice: '',
  durationMinutes: '60',
};

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none';

export default function NewAuctionPage() {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  function loadCategories() {
    api.get('/categories').then(({ data }) => setCategories(data.items || []));
  }
  useEffect(loadCategories, []);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.skinName || !form.imageUrl || !form.categoryId || !form.floatValue || !form.startPrice) {
      showAlert('Iltimos, barcha majburiy maydonlarni to\'ldiring.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/admin/auctions', {
        ...form,
        floatValue: Number(form.floatValue),
        startPrice: Number(form.startPrice),
        durationMinutes: Number(form.durationMinutes),
      });
      showAlert('✅ Auksion yaratildi.');
      setForm(EMPTY);
    } catch (err) {
      showAlert(err.response?.data?.error || 'Xatolik yuz berdi.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Skin nomi *">
        <input className={inputCls} value={form.skinName} onChange={(e) => set('skinName', e.target.value)} placeholder="AK-47 | Redline" />
      </Field>

      <Field label="Rasm URL *">
        <input className={inputCls} value={form.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} placeholder="https://..." />
      </Field>
      {form.imageUrl && (
        <img src={form.imageUrl} alt="" className="h-20 w-20 rounded-lg border border-border bg-surface object-contain p-1" onError={(e) => (e.target.style.display = 'none')} />
      )}

      <Field label="Kategoriya *">
        <div className="flex gap-2">
          <select className={inputCls} value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
            <option value="">— tanlang —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        {!categories.length && (
          <p className="mt-1 text-[11px] text-warning">Hali kategoriya yo'q — avval "Kategoriyalar" bo'limidan qo'shing.</p>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Kamyoblik rangi *">
          <select className={inputCls} value={form.rarity} onChange={(e) => set('rarity', e.target.value)}>
            {RARITIES.map((r) => (
              <option key={r.v} value={r.v}>{r.l}</option>
            ))}
          </select>
        </Field>
        <Field label="Format factory (0-1) *">
          <input
            className={inputCls}
            type="number"
            step="0.0000001"
            min="0"
            max="1"
            value={form.floatValue}
            onChange={(e) => set('floatValue', e.target.value)}
            placeholder="0.1325410"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Format factory kategoriyasi *">
          <select className={inputCls} value={form.wearCondition} onChange={(e) => set('wearCondition', e.target.value)}>
            {WEARS.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </Field>
        <Field label="StatTrak™">
          <label className="flex h-[38px] items-center gap-2 rounded-lg border border-border bg-surface px-3">
            <input type="checkbox" checked={form.isStatTrak} onChange={(e) => set('isStatTrak', e.target.checked)} />
            <span className="text-sm text-ink">{form.isStatTrak ? 'Ha' : "Yo'q"}</span>
          </label>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Boshlang'ich narx (so'm) *">
          <input className={inputCls} type="number" min="0" value={form.startPrice} onChange={(e) => set('startPrice', e.target.value)} placeholder="150000" />
        </Field>
        <Field label="Davomiyligi (daqiqa) *">
          <input className={inputCls} type="number" min="1" value={form.durationMinutes} onChange={(e) => set('durationMinutes', e.target.value)} />
        </Field>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {submitting ? 'Yaratilmoqda…' : 'Auksion yaratish'}
      </button>
    </form>
  );
}

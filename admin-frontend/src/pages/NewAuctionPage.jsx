import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { showAlert } from '../telegram';
import { RARITIES, WEARS } from '../constants';
import SearchableSelect from '../components/SearchableSelect';

const EMPTY = {
  skinName: '',
  imageUrl: '',
  subcategoryId: '',
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

  // Barcha sub-kategoriyalarni bitta ro'yxatga tekislaymiz, har biriga ota
  // kategoriya nomini "group" sifatida biriktiramiz — shunda live-search
  // ham sub-kategoriya, ham kategoriya nomi bo'yicha qidira oladi (masalan
  // "AK-47" yozib ham, "Винтовки" yozib ham topish mumkin).
  const subcategoryOptions = useMemo(
    () =>
      categories.flatMap((c) =>
        c.subcategories.map((s) => ({ value: s.id, label: s.name, group: c.name }))
      ),
    [categories]
  );

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.skinName || !form.imageUrl || !form.subcategoryId || !form.floatValue || !form.startPrice) {
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

      <Field label="Sub-kategoriya * (kategoriya yoki sub-kategoriya nomi bo'yicha qidiring)">
        <SearchableSelect
          options={subcategoryOptions}
          value={form.subcategoryId}
          onChange={(v) => set('subcategoryId', v)}
          placeholder="Masalan: AK-47, Karambit…"
        />
        {!subcategoryOptions.length && (
          <p className="mt-1 text-[11px] text-warning">
            Hali sub-kategoriya yo'q — avval "Kategoriyalar" bo'limidan qo'shing.
          </p>
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

import { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { api } from '../api';
import { showAlert } from '../telegram';
import { RARITIES, WEARS, NO_FLOAT_TYPE_NAMES } from '../constants';
import SearchableSelect from './SearchableSelect';

export const inputCls =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none';

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

/**
 * Auksion yaratish VA tahrirlash uchun BITTA umumiy forma — 10-band talabiga
 * ko'ra ikkalasi bir xil uslubda bo'lishi uchun. `initial` — boshlang'ich
 * qiymatlar (tahrirlashda mavjud auksion, yaratishda bo'sh forma).
 */
export default function AuctionForm({ initial, submitLabel, onSubmit }) {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(initial);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/categories').then(({ data }) => setCategories(data.items || []));
  }, []);

  const subcategoryOptions = useMemo(
    () => categories.flatMap((c) => c.subcategories.map((s) => ({ value: s.id, label: s.name, group: c.name }))),
    [categories]
  );

  // 9-band: tanlangan Kategoriya qaysi Tipga tegishli ekaniga qarab, format
  // factory (float/износ) maydonlari kerak-kerak emasligini aniqlaymiz.
  const selectedTypeName = subcategoryOptions.find((o) => o.value === form.subcategoryId)?.group;
  const needsFloat = !selectedTypeName || !NO_FLOAT_TYPE_NAMES.includes(selectedTypeName);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function addSticker() {
    setForm((f) => ({ ...f, stickers: [...(f.stickers || []), { name: '', imageUrl: '' }] }));
  }
  function updateSticker(i, key, value) {
    setForm((f) => {
      const stickers = [...f.stickers];
      stickers[i] = { ...stickers[i], [key]: value };
      return { ...f, stickers };
    });
  }
  function removeSticker(i) {
    setForm((f) => ({ ...f, stickers: f.stickers.filter((_, idx) => idx !== i) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.skinName || !form.imageUrl || !form.subcategoryId || !form.startPrice || (needsFloat && !form.floatValue)) {
      showAlert('Заполните все обязательные поля.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        ...form,
        floatValue: needsFloat ? Number(form.floatValue) : null,
        wearCondition: needsFloat ? form.wearCondition : null,
        startPrice: Number(form.startPrice),
        paintSeed: form.paintSeed === '' ? null : Number(form.paintSeed),
        stickers: (form.stickers || []).filter((s) => s.name && s.imageUrl),
        ...(form.durationMinutes !== undefined ? { durationMinutes: Number(form.durationMinutes) } : {}),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Field label="Название скина *">
        <input className={inputCls} value={form.skinName} onChange={(e) => set('skinName', e.target.value)} placeholder="AK-47 | Redline" />
      </Field>

      <Field label="URL изображения *">
        <input className={inputCls} value={form.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} placeholder="https://..." />
      </Field>
      {form.imageUrl && (
        <img src={form.imageUrl} alt="" className="h-20 w-20 rounded-lg border border-border bg-surface object-contain p-1" onError={(e) => (e.target.style.display = 'none')} />
      )}

      <Field label="Категория * (ищите по названию типа или категории)">
        <SearchableSelect
          options={subcategoryOptions}
          value={form.subcategoryId}
          onChange={(v) => set('subcategoryId', v)}
          placeholder="Например: AK-47, Karambit…"
        />
        {!subcategoryOptions.length && (
          <p className="mt-1 text-[11px] text-warning">Пока нет подкатегорий — сначала добавьте их в разделе «Категории».</p>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Редкость *">
          <select className={inputCls} value={form.rarity} onChange={(e) => set('rarity', e.target.value)}>
            {RARITIES.map((r) => (
              <option key={r.v} value={r.v}>{r.l}</option>
            ))}
          </select>
        </Field>
        {needsFloat && (
          <Field label="Float (0-1) *">
            <input
              className={inputCls}
              type="number"
              step="any"
              min="0"
              max="1"
              value={form.floatValue}
              onChange={(e) => set('floatValue', e.target.value)}
              placeholder="0.1325410"
            />
          </Field>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {needsFloat && (
          <Field label="Класс износа *">
            <select className={inputCls} value={form.wearCondition} onChange={(e) => set('wearCondition', e.target.value)}>
              {WEARS.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Шаблон раскраски (Paint Seed)">
          <input
            className={inputCls}
            type="number"
            min="0"
            value={form.paintSeed ?? ''}
            onChange={(e) => set('paintSeed', e.target.value)}
            placeholder="Необязательно"
          />
        </Field>
      </div>

      <Field label="Steam Asset ID (для автоматической отправки, необязательно)">
        <input
          className={inputCls}
          value={form.steamAssetId ?? ''}
          onChange={(e) => set('steamAssetId', e.target.value)}
          placeholder="ID предмета в инвентаре бота — если пусто, отправка будет вручную"
        />
      </Field>

      <Field label="StatTrak™">
        <label className="flex h-[38px] w-full items-center gap-2 rounded-lg border border-border bg-surface px-3">
          <input type="checkbox" checked={form.isStatTrak} onChange={(e) => set('isStatTrak', e.target.checked)} />
          <span className="text-sm text-ink">{form.isStatTrak ? 'Да' : 'Нет'}</span>
        </label>
      </Field>

      {/* 9-band: stikerlar — soni oldindan noma'lum, admin kerakicha qo'shadi/o'chiradi */}
      <div>
        <span className="mb-1 block text-xs font-medium text-muted">Наклейки (необязательно)</span>
        <div className="space-y-2">
          {(form.stickers || []).map((s, i) => (
            <div key={i} className="flex gap-2">
              <input
                className={inputCls}
                value={s.name}
                onChange={(e) => updateSticker(i, 'name', e.target.value)}
                placeholder="Название наклейки"
              />
              <input
                className={inputCls}
                value={s.imageUrl}
                onChange={(e) => updateSticker(i, 'imageUrl', e.target.value)}
                placeholder="URL изображения"
              />
              <button type="button" onClick={() => removeSticker(i)} className="shrink-0 rounded-lg bg-danger/10 px-2.5 text-danger">
                <X size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addSticker}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted"
          >
            <Plus size={13} /> Добавить наклейку
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Начальная цена (сум) *">
          <input className={inputCls} type="number" min="0" value={form.startPrice} onChange={(e) => set('startPrice', e.target.value)} placeholder="150000" />
        </Field>
        {form.durationMinutes !== undefined && (
          <Field label="Длительность (мин) *">
            <input className={inputCls} type="number" min="1" value={form.durationMinutes} onChange={(e) => set('durationMinutes', e.target.value)} />
          </Field>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {submitting ? 'Сохранение…' : submitLabel}
      </button>
    </form>
  );
}

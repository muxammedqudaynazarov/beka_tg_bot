import { useEffect, useState } from 'react';
import { Plus, Trash2, ToggleLeft, ToggleRight, Dices } from 'lucide-react';
import { api } from '../api';
import { showAlert, showConfirm } from '../telegram';
import { RARITIES, WEARS } from '../constants';

const TYPE_OPTIONS = [
  { v: 'TOPUP_BONUS_PROMO', l: 'Промокод на пополнение (%)' },
  { v: 'PAID_PROMO', l: 'Платный промокод (сумма)' },
  { v: 'BOMB', l: 'Бомба (без выигрыша)' },
  { v: 'SKIN', l: 'Скин' },
  { v: 'DISCOUNT_PROMO', l: 'Промокод скидки на лот (%)' },
];

function CreateForm({ onCreated }) {
  const [type, setType] = useState('TOPUP_BONUS_PROMO');
  const [label, setLabel] = useState('');
  const [weight, setWeight] = useState('');
  const [percent, setPercent] = useState('');
  const [amount, setAmount] = useState('');
  const [discountUses, setDiscountUses] = useState('1');
  const [skinName, setSkinName] = useState('');
  const [skinImageUrl, setSkinImageUrl] = useState('');
  const [skinRarity, setSkinRarity] = useState('CONSUMER');
  const [skinWearCondition, setSkinWearCondition] = useState('FT');
  const [skinFloatValue, setSkinFloatValue] = useState('');
  const [skinPaintSeed, setSkinPaintSeed] = useState('');
  const [skinSteamAssetId, setSkinSteamAssetId] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await api.post('/admin/wheel-items', {
        type, label, weight,
        percent: type === 'TOPUP_BONUS_PROMO' || type === 'DISCOUNT_PROMO' ? percent : undefined,
        discountUses: type === 'DISCOUNT_PROMO' ? discountUses : undefined,
        amount: type === 'PAID_PROMO' ? amount : undefined,
        skinName: type === 'SKIN' ? skinName : undefined,
        skinImageUrl: type === 'SKIN' ? skinImageUrl : undefined,
        skinRarity: type === 'SKIN' ? skinRarity : undefined,
        skinWearCondition: type === 'SKIN' ? skinWearCondition : undefined,
        skinFloatValue: type === 'SKIN' ? skinFloatValue : undefined,
        skinPaintSeed: type === 'SKIN' ? skinPaintSeed : undefined,
        skinSteamAssetId: type === 'SKIN' ? skinSteamAssetId : undefined,
      });
      showAlert('✅ Элемент добавлен в барабан.');
      setLabel(''); setWeight(''); setPercent(''); setAmount('');
      setSkinName(''); setSkinImageUrl(''); setSkinFloatValue(''); setSkinPaintSeed(''); setSkinSteamAssetId('');
      onCreated();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Произошла ошибка.');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none';

  return (
    <div className="space-y-2 rounded-lg border border-accent/30 bg-accent/5 p-3">
      <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
        {TYPE_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder='Название (например "15% на пополнение")' className={inputCls} />
      <input type="number" min="1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Вес вероятности (например 20 из 100/20)" className={inputCls} />

      {(type === 'TOPUP_BONUS_PROMO' || type === 'DISCOUNT_PROMO') && (
        <input type="number" min="1" max="100" value={percent} onChange={(e) => setPercent(e.target.value)} placeholder="Процент, %" className={inputCls} />
      )}
      {type === 'DISCOUNT_PROMO' && (
        <input type="number" min="1" value={discountUses} onChange={(e) => setDiscountUses(e.target.value)} placeholder="Кол-во использований скидки" className={inputCls} />
      )}
      {type === 'PAID_PROMO' && (
        <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Сумма (сум)" className={inputCls} />
      )}
      {type === 'SKIN' && (
        <>
          <input value={skinName} onChange={(e) => setSkinName(e.target.value)} placeholder="Название скина *" className={inputCls} />
          <input value={skinImageUrl} onChange={(e) => setSkinImageUrl(e.target.value)} placeholder="URL изображения *" className={inputCls} />
          <div className="flex gap-2">
            <select value={skinRarity} onChange={(e) => setSkinRarity(e.target.value)} className={inputCls}>
              {RARITIES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
            </select>
            <select value={skinWearCondition} onChange={(e) => setSkinWearCondition(e.target.value)} className={inputCls}>
              {WEARS.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <input type="number" step="0.00000001" value={skinFloatValue} onChange={(e) => setSkinFloatValue(e.target.value)} placeholder="Float (необязательно)" className={inputCls} />
            <input type="number" value={skinPaintSeed} onChange={(e) => setSkinPaintSeed(e.target.value)} placeholder="Paint Seed (необязательно)" className={inputCls} />
          </div>
          <input value={skinSteamAssetId} onChange={(e) => setSkinSteamAssetId(e.target.value)} placeholder="Steam Asset ID (для авто-выдачи, необязательно)" className={inputCls} />
        </>
      )}

      <button onClick={submit} disabled={saving} className="flex w-full items-center justify-center gap-1.5 rounded-md bg-accent py-1.5 text-xs font-semibold text-white disabled:opacity-50">
        <Plus size={13} /> {saving ? 'Сохранение…' : 'Добавить в барабан'}
      </button>
      <p className="text-[10px] text-muted">
        Можно добавить несколько элементов одного типа с разными значениями (например 5%, 10%, 15%).
        Веса не обязаны в сумме давать 100 — используются как относительная вероятность.
      </p>
    </div>
  );
}

function ItemRow({ item, totalWeight, onChanged }) {
  const percentOfTotal = totalWeight > 0 ? ((item.weight / totalWeight) * 100).toFixed(1) : '0';
  const isClaimedSkin = item.type === 'SKIN' && item.timesWon > 0;

  async function toggleActive() {
    // Yutilgan skinni QAYTA yoqish — jismoniy nusxa allaqachon berilgan
    // bo'lgani uchun juda xavfli (yana kimgadir "tushishi" mumkin, lekin
    // uni hech kim ololmaydi). Shuning uchun bu holatda alohida tasdiqlash so'raladi.
    if (isClaimedSkin && !item.isActive) {
      const ok = await showConfirm(
        `Внимание: этот скин УЖЕ был выигран (${item.timesWon} раз) — физическая копия, скорее всего, уже отдана. Включить его снова означает, что он может "выпасть" ещё раз, но реально отправить будет нечего. Всё равно включить?`
      );
      if (!ok) return;
    }
    await api.patch(`/admin/wheel-items/${item.id}`, { isActive: !item.isActive });
    onChanged();
  }
  async function remove() {
    const ok = await showConfirm(`Удалить «${item.label}» из барабана?`);
    if (!ok) return;
    await api.delete(`/admin/wheel-items/${item.id}`);
    onChanged();
  }

  return (
    <div className={`rounded-lg border p-3 ${isClaimedSkin ? 'border-warning/40 bg-warning/5' : 'border-border'}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-ink">{item.label}</p>
          <p className="text-[10px] text-muted">
            {TYPE_OPTIONS.find((o) => o.v === item.type)?.l} · вес {item.weight}
            {item.isActive && ` (${percentOfTotal}% шанс)`}
          </p>
          {isClaimedSkin && (
            <p className="mt-0.5 text-[10px] font-semibold text-warning">
              ⚠️ Уже выигран ({item.timesWon}×) — добавьте новый скин вместо этого
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={toggleActive} className={item.isActive ? 'text-success' : 'text-muted'}>
            {item.isActive ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
          </button>
          <button onClick={remove} className="text-muted hover:text-danger">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WheelPage() {
  const [data, setData] = useState(null);

  function load() {
    api.get('/admin/wheel-items').then(({ data }) => setData(data));
  }
  useEffect(load, []);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/5 p-3 text-[11px] text-muted">
        <Dices size={14} className="mt-0.5 shrink-0 text-accent" />
        Пользователи крутят барабан раз в 24 часа. Промокоды на пополнение/скидку/сумму активируются пользователем
        в течение 24 часов, иначе сгорают. Скины сразу зачисляются в профиль.
      </div>
      <CreateForm onCreated={load} />
      {data === null ? (
        <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-surface" />)}</div>
      ) : data.items.length ? (
        <div className="space-y-2">
          {data.items.map((it) => <ItemRow key={it.id} item={it} totalWeight={data.totalWeight} onChanged={load} />)}
        </div>
      ) : (
        <p className="text-xs text-muted">Барабан пока пуст.</p>
      )}
    </div>
  );
}

import {useEffect, useState} from 'react';
import {Plus, Trash2, Ticket, ToggleLeft, ToggleRight} from 'lucide-react';
import {api} from '../api';
import {showAlert, showConfirm} from '../telegram';

function formatSom(n) {
    return `${Number(n || 0).toLocaleString('ru-RU')} сум`;
}

const TYPE_LABELS = {
    DISCOUNT: 'Скидка на лот',
    BALANCE_TOPUP: 'Пополнение баланса',
    FIRST_DEPOSIT_BONUS: 'Бонус на первое пополнение',
    NEXT_DEPOSIT_BONUS: 'Бонус на пополнение (Барабан)',
};

function CreateForm({onCreated}) {
    const [code, setCode] = useState('');
    const [type, setType] = useState('DISCOUNT');
    const [discountPercent, setDiscountPercent] = useState('');
    const [discountUses, setDiscountUses] = useState('1');
    const [topupAmount, setTopupAmount] = useState('');
    const [bonusPercent, setBonusPercent] = useState('');
    const [maxRedemptions, setMaxRedemptions] = useState('');
    const [saving, setSaving] = useState(false);

    async function submit() {
        if (!code.trim()) return showAlert('Введите код.');
        setSaving(true);
        try {
            await api.post('/admin/promo-codes', {
                code: code.trim(),
                type,
                discountPercent: type === 'DISCOUNT' ? Number(discountPercent) : undefined,
                discountUses: type === 'DISCOUNT' ? Number(discountUses) : undefined,
                topupAmount: type === 'BALANCE_TOPUP' ? Number(topupAmount) : undefined,
                bonusPercent: type === 'FIRST_DEPOSIT_BONUS' ? Number(bonusPercent) : undefined,
                maxRedemptions: maxRedemptions ? Number(maxRedemptions) : undefined,
            });
            showAlert('✅ Промо-код создан.');
            setCode('');
            setDiscountPercent('');
            setTopupAmount('');
            setBonusPercent('');
            setMaxRedemptions('');
            onCreated();
        } catch (err) {
            showAlert(err.response?.data?.error || 'Произошла ошибка.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-2 rounded-lg border border-accent/30 bg-accent/5 p-3">
            <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="КОД (например SUMMER2026)"
                className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs uppercase text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
            >
                <option value="DISCOUNT">Скидка на лот</option>
                <option value="BALANCE_TOPUP">Пополнение баланса (фикс. сумма)</option>
                <option value="FIRST_DEPOSIT_BONUS">Бонус +% на первое пополнение</option>
            </select>

            {type === 'DISCOUNT' && (
                <div className="flex gap-2">
                    <input
                        type="number" min="1" max="100"
                        value={discountPercent}
                        onChange={(e) => setDiscountPercent(e.target.value)}
                        placeholder="Скидка, %"
                        className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
                    />
                    <input
                        type="number" min="1"
                        value={discountUses}
                        onChange={(e) => setDiscountUses(e.target.value)}
                        placeholder="Использований"
                        className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
                    />
                </div>
            )}
            {type === 'BALANCE_TOPUP' && (
                <input
                    type="number" min="1"
                    value={topupAmount}
                    onChange={(e) => setTopupAmount(e.target.value)}
                    placeholder="Сумма пополнения (сум)"
                    className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
                />
            )}
            {type === 'FIRST_DEPOSIT_BONUS' && (
                <input
                    type="number" min="1" max="100"
                    value={bonusPercent}
                    onChange={(e) => setBonusPercent(e.target.value)}
                    placeholder="Бонус, % от суммы первого пополнения"
                    className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
                />
            )}

            <input
                type="number" min="1"
                value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(e.target.value)}
                placeholder="Лимит активаций всего (пусто = без лимита)"
                className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />

            <button onClick={submit} disabled={saving}
                    className="flex w-full items-center justify-center gap-1.5 rounded-md bg-accent py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                <Plus size={13}/> {saving ? 'Создание…' : 'Создать промо-код'}
            </button>
            <p className="text-[10px] text-muted">
                Каждый пользователь может использовать конкретный код только один раз.
                Бонус на первое пополнение виден пользователю только до его первого пополнения.
            </p>
        </div>
    );
}

function PromoRow({promo, onChanged}) {
    async function toggleActive() {
        await api.patch(`/admin/promo-codes/${promo.id}`, {isActive: !promo.isActive});
        onChanged();
    }

    async function remove() {
        const ok = await showConfirm(`Удалить промо-код "${promo.code}"?`);
        if (!ok) return;
        try {
            await api.delete(`/admin/promo-codes/${promo.id}`);
            onChanged();
        } catch (err) {
            showAlert(err.response?.data?.error || 'Произошла ошибка.');
        }
    }

    let detail = '';
    if (promo.type === 'DISCOUNT') detail = `${Number(promo.discountPercent)}% × ${promo.discountUses} исп.`;
    if (promo.type === 'BALANCE_TOPUP') detail = formatSom(promo.topupAmount);
    if (promo.type === 'FIRST_DEPOSIT_BONUS') detail = `+${Number(promo.bonusPercent)}% на первый депозит`;
    if (promo.type === 'NEXT_DEPOSIT_BONUS') detail = `+${Number(promo.bonusPercent)}% на ближайшее пополнение`;

    return (
        <div className="rounded-lg border border-border p-3">
            <div className="flex items-start justify-between">
                <div>
                    <p className="font-mono text-sm font-bold text-ink">{promo.code}</p>
                    <p className="text-[10px] text-muted">{TYPE_LABELS[promo.type]} · {detail}</p>
                    <p className="mt-0.5 text-[10px] text-muted">
                        Активаций: {promo.redemptionCount}{promo.maxRedemptions ? ` / ${promo.maxRedemptions}` : ''}
                    </p>
                    {promo.depositStats && (promo.type === 'FIRST_DEPOSIT_BONUS' || promo.type === 'NEXT_DEPOSIT_BONUS') && (
                        <p className="mt-0.5 text-[10px] text-muted">
                            Общая сумма: {formatSom(promo.depositStats.totalAmount)}
                        </p>
                    )}
                    {promo.wonByUser && (
                        <p className="mt-0.5 text-[10px] text-muted">
                            🎲 Выигрыш барабана
                            · {promo.wonByUser.username ? `@${promo.wonByUser.username}` : String(promo.wonByUser.telegramId)}
                        </p>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <button onClick={toggleActive} className={promo.isActive ? 'text-success' : 'text-muted'}>
                        {promo.isActive ? <ToggleRight size={20}/> : <ToggleLeft size={20}/>}
                    </button>
                    <button onClick={remove} className="text-muted hover:text-danger">
                        <Trash2 size={14}/>
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function PromoCodesPage() {
    const [items, setItems] = useState(null);

    function load() {
        api.get('/admin/promo-codes').then(({data}) => setItems(data.items || []));
    }

    useEffect(load, []);

    return (
        <div className="space-y-4">
            <div
                className="flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/5 p-3 text-[11px] text-muted">
                <Ticket size={14} className="mt-0.5 shrink-0 text-accent"/>
                Промо-коды пользователи вводят в разделе «Профиль» приложения — эффект применяется автоматически.
            </div>
            <CreateForm onCreated={load}/>
            {items === null ? (
                <div className="space-y-2">{[0, 1].map((i) => <div key={i}
                                                                   className="h-16 animate-pulse rounded-lg bg-surface"/>)}</div>
            ) : items.length ? (
                <div className="space-y-2">
                    {items.map((p) => <PromoRow key={p.id} promo={p} onChanged={load}/>)}
                </div>
            ) : (
                <p className="text-xs text-muted">Промо-кодов пока нет.</p>
            )}
        </div>
    );
}

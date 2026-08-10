import { useEffect, useState } from 'react';
import { Search, Plus, CheckCircle2, Clock3, X, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { showAlert } from '../telegram';

function formatSom(n) {
  return `${Number(n || 0).toLocaleString('ru-RU')} сум`;
}

function RecordSaleForm({ userId, onDone }) {
  const [itemName, setItemName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!itemName.trim() || !amount) return showAlert('Укажите название предмета и сумму.');
    setSaving(true);
    try {
      await api.post(`/admin/users/${userId}/sales`, { itemName: itemName.trim(), agreedAmount: Number(amount), note: note.trim() || undefined });
      showAlert('✅ Сделка зафиксирована.');
      setItemName('');
      setAmount('');
      setNote('');
      onDone();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Произошла ошибка.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-accent/30 bg-accent/5 p-3">
      <input
        value={itemName}
        onChange={(e) => setItemName(e.target.value)}
        placeholder="Название предмета (например AK-47 | Redline)"
        className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <input
        type="number"
        min="0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Согласованная сумма (сум)"
        className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Заметка (необязательно)"
        className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <button
        onClick={submit}
        disabled={saving}
        className="w-full rounded-md bg-accent py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        {saving ? 'Сохранение…' : 'Зафиксировать сделку'}
      </button>
      <p className="text-[10px] text-muted">
        Отсчёт 8-дневного периода защиты сделки Steam начнётся с этого момента — оплату можно
        будет произвести после его истечения (появится вверху списка «Запланированные выплаты»).
      </p>
    </div>
  );
}

function UserCard({ user, onChanged }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState(null);
  const [showForm, setShowForm] = useState(false);

  async function toggle() {
    if (!expanded && !detail) {
      const { data } = await api.get(`/admin/users/${user.id}`);
      setDetail(data);
    }
    setExpanded((v) => !v);
  }

  async function refreshDetail() {
    const { data } = await api.get(`/admin/users/${user.id}`);
    setDetail(data);
    setShowForm(false);
    onChanged();
  }

  async function copyCode(e) {
    e.stopPropagation();
    if (user.code === undefined || user.code === null) {
      showAlert('⚠️ Код ещё не назначен — обновите страницу или проверьте, что миграция базы данных выполнена (npx prisma db push на сервере).');
      return;
    }
    try {
      await navigator.clipboard.writeText(String(user.code));
      showAlert('📋 Код скопирован: ' + user.code);
    } catch {
      showAlert('Код: ' + user.code);
    }
  }

  return (
    <div className="rounded-lg border border-border">
      <button onClick={toggle} className="flex w-full items-center justify-between px-3 py-2.5 text-left">
        <div>
          <p className="text-sm font-medium text-ink">
            {user.code || 'Без имени'} {user.username ? `· @${user.username}` : ''}
          </p>
          <p className="text-[10px] text-muted">Баланс: {formatSom(user.balance)} · Сделок: {user._count?.soldItems ?? 0}</p>
          <span
            role="button"
            tabIndex={0}
            onClick={copyCode}
            onKeyDown={(e) => e.key === 'Enter' && copyCode(e)}
            className="mt-1 inline-flex items-center gap-1 rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-accent"
          >
            Код: {user.code ?? '—'} (нажмите, чтобы скопировать)
          </span>
        </div>
        {user.isBanned && <span className="rounded bg-danger/15 px-1.5 py-0.5 text-[9px] font-semibold text-danger">БАН</span>}
      </button>

      {expanded && detail && (
        <div className="space-y-2 border-t border-border p-3">
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted"
            >
              <Plus size={13} /> Зафиксировать продажу инвентаря
            </button>
          ) : (
            <div className="relative">
              <button onClick={() => setShowForm(false)} className="absolute -right-1 -top-1 text-muted"><X size={14} /></button>
              <RecordSaleForm userId={user.id} onDone={refreshDetail} />
            </div>
          )}

          {detail.soldItems?.length > 0 && (
            <div className="space-y-1.5">
              {detail.soldItems.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-md bg-surface px-2.5 py-1.5 text-xs">
                  <div>
                    <p className="text-ink">{s.itemName}</p>
                    <p className="text-[10px] text-muted">{new Date(s.createdAt).toLocaleDateString('ru-RU')}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-ink">{formatSom(s.agreedAmount)}</span>
                    {s.paidAt ? (
                      <CheckCircle2 size={13} className="text-success" />
                    ) : (
                      <Clock3 size={13} className="text-warning" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 2-band: bitta ro'yxatda — muddati YETGANLAR yuqorida (yashil, tugma faol),
// hali kutilayotganlar pastda (kulrang, necha kun qolgani ko'rsatiladi).
function PayoutRow({ sale, onPaid }) {
  const [paying, setPaying] = useState(false);
  const label = sale.seller.username ? `@${sale.seller.username}` : sale.seller.firstName;

  async function markPaid() {
    setPaying(true);
    try {
      await api.post(`/admin/sales/${sale.id}/mark-paid`);
      showAlert('✅ Отмечено как оплачено.');
      onPaid();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Произошла ошибка.');
    } finally {
      setPaying(false);
    }
  }

  if (sale.ready) {
    return (
      <div className="rounded-lg border border-success/40 bg-success/5 p-3">
        <p className="text-sm font-medium text-ink">{sale.itemName}</p>
        <p className="mt-0.5 text-[11px] text-muted">{label} · {formatSom(sale.agreedAmount)}</p>
        <p className="mt-0.5 text-[10px] text-success">✅ Готово к оплате — 8 дней прошло</p>
        <button
          onClick={markPaid}
          disabled={paying}
          className="mt-2 w-full rounded-md bg-success py-1.5 text-xs font-semibold text-black disabled:opacity-50"
        >
          {paying ? 'Сохранение…' : '💸 Отметить как оплачено'}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border p-3 opacity-70">
      <p className="text-sm font-medium text-ink">{sale.itemName}</p>
      <p className="mt-0.5 text-[11px] text-muted">{label} · {formatSom(sale.agreedAmount)}</p>
      <p className="mt-0.5 text-[10px] text-warning">⏳ Осталось {sale.daysLeft} дн. до защиты сделки</p>
    </div>
  );
}

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState(null);
  const [payouts, setPayouts] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  function loadUsers() {
    api.get('/admin/users', { params: search ? { search } : {} }).then(({ data }) => setUsers(data.items || []));
  }

  async function loadPayouts() {
    const [ready, pending] = await Promise.all([
      api.get('/admin/sales/ready-to-pay'),
      api.get('/admin/sales/pending'),
    ]);
    const readyItems = (ready.data.items || []).map((s) => ({ ...s, ready: true }));
    const pendingItems = (pending.data.items || []).map((s) => {
      const readyAt = new Date(s.createdAt).getTime() + 8 * 24 * 60 * 60 * 1000;
      const daysLeft = Math.max(1, Math.ceil((readyAt - Date.now()) / (24 * 60 * 60 * 1000)));
      return { ...s, ready: false, daysLeft };
    });
    setPayouts([...readyItems, ...pendingItems]);
    setLastUpdated(new Date());
  }

  async function refreshAll() {
    setRefreshing(true);
    try {
      await Promise.all([loadPayouts(), loadUsers()]);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(loadUsers, [search]);
  useEffect(() => { loadPayouts(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted">
          {lastUpdated ? `Обновлено: ${lastUpdated.toLocaleTimeString('ru-RU')}` : ''}
        </p>
        <button
          onClick={refreshAll}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-[10px] font-medium text-ink disabled:opacity-50"
        >
          <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} /> Обновить
        </button>
      </div>

      {payouts && payouts.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
            Запланированные выплаты ({payouts.length})
          </h2>
          <div className="space-y-2">
            {payouts.map((s) => <PayoutRow key={s.id} sale={s} onPaid={() => { loadPayouts(); loadUsers(); }} />)}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Пользователи</h2>
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
          <Search size={14} className="shrink-0 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени, username или коду…"
            className="w-full bg-transparent text-xs text-ink placeholder:text-muted focus:outline-none"
          />
        </div>
        {users === null ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-surface" />)}</div>
        ) : users.length ? (
          <div className="space-y-2">
            {users.map((u) => <UserCard key={u.id} user={u} onChanged={loadPayouts} />)}
          </div>
        ) : (
          <p className="text-xs text-muted">Никого не найдено.</p>
        )}
      </section>
    </div>
  );
}

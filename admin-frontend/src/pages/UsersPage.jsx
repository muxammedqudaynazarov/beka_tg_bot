import { useEffect, useState, useRef } from 'react';
import { Search, Plus, CheckCircle2, Clock3, X, RefreshCw, Ban, ShieldOff, Trash2, Copy, MessageCircle, Gift } from 'lucide-react';
import { api } from '../api';
import { showAlert, showConfirm } from '../telegram';

function formatSom(n) {
  return `${Number(n || 0).toLocaleString('ru-RU')} сум`;
}

// 3-band: adashtirib qo'ymaslik uchun — @username bo'lsa shu, bo'lmasa
// aniq Telegram ID (masalan "6556522") ko'rsatiladi, hech qachon faqat
// ism (ko'p odamda bir xil bo'lishi mumkin) emas.
function userLabel(user) {
  return user.username ? `@${user.username}` : String(user.telegramId);
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
        Отсчёт 8-дневного периода защиты сделки Steam начнётся с этого момента, и продавец получит
        {' '}5 баллов рейтинга. Оплату можно будет произвести после истечения периода.
      </p>
    </div>
  );
}

// 3-band: bitta foydalanuvchiga bir nechta, turli foizli va turli
// "necha marta ishlatish mumkin"ligiga ega skidkalarni qo'lda berish.
function DiscountForm({ userId, onDone }) {
  const [percent, setPercent] = useState('');
  const [uses, setUses] = useState('1');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!percent || Number(percent) <= 0) return showAlert('Укажите процент скидки.');
    setSaving(true);
    try {
      await api.post(`/admin/users/${userId}/discounts`, { percent: Number(percent), uses: Number(uses) });
      showAlert('🎁 Скидка начислена.');
      setPercent('');
      setUses('1');
      onDone();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Произошла ошибка.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-success/30 bg-success/5 p-3">
      <div className="flex gap-2">
        <input
          type="number"
          min="1"
          max="100"
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          placeholder="Скидка, %"
          className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-muted focus:border-success focus:outline-none"
        />
        <input
          type="number"
          min="1"
          value={uses}
          onChange={(e) => setUses(e.target.value)}
          placeholder="Кол-во раз"
          className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-muted focus:border-success focus:outline-none"
        />
      </div>
      <button onClick={submit} disabled={saving} className="w-full rounded-md bg-success py-1.5 text-xs font-semibold text-black disabled:opacity-50">
        {saving ? 'Сохранение…' : 'Начислить скидку'}
      </button>
      <p className="text-[10px] text-muted">
        Например: 3% на 5 использований — пользователь сможет применить эту скидку до 5 раз при выигрыше на аукционе.
      </p>
    </div>
  );
}

// 4-band: ban qilish — sababi majburiy so'raladi, foydalanuvchiga shu
// sabab bilan xabar ketadi (backend'da amalga oshirilgan).
function BanForm({ userId, onDone }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await api.post(`/admin/users/${userId}/ban`, { reason: reason.trim() || undefined });
      showAlert('⛔ Пользователь заблокирован.');
      onDone();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Произошла ошибка.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-danger/30 bg-danger/5 p-3">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Причина блокировки (увидит пользователь)"
        className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-muted focus:border-danger focus:outline-none"
      />
      <button onClick={submit} disabled={saving} className="w-full rounded-md bg-danger py-1.5 text-xs font-semibold text-white disabled:opacity-50">
        {saving ? 'Сохранение…' : 'Подтвердить блокировку'}
      </button>
    </div>
  );
}

function UserCard({ user, onChanged, autoExpand }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState(null);
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [showBanForm, setShowBanForm] = useState(false);
  const [showDiscountForm, setShowDiscountForm] = useState(false);

  async function loadDetail() {
    const { data } = await api.get(`/admin/users/${user.id}`);
    setDetail(data);
  }

  async function toggle() {
    if (!expanded && !detail) await loadDetail();
    setExpanded((v) => !v);
  }

  useEffect(() => {
    if (autoExpand) {
      loadDetail();
      setExpanded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoExpand]);

  async function refreshDetail() {
    await loadDetail();
    setShowSaleForm(false);
    setShowBanForm(false);
    setShowDiscountForm(false);
    onChanged();
  }

  async function unban() {
    const ok = await showConfirm('Разблокировать этого пользователя?');
    if (!ok) return;
    try {
      await api.post(`/admin/users/${user.id}/unban`);
      showAlert('✅ Разблокирован.');
      refreshDetail();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Произошла ошибка.');
    }
  }

  async function copyId(e) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(String(user.telegramId));
      showAlert('📋 Скопировано: ' + user.telegramId);
    } catch {
      showAlert('Telegram ID: ' + user.telegramId);
    }
  }

  return (
    <div id={`user-${user.id}`} className="rounded-lg border border-border">
      <div className="flex items-center justify-between px-3 py-2.5">
        <div role="button" tabIndex={0} onClick={toggle} onKeyDown={(e) => e.key === 'Enter' && toggle()} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium text-ink">
            {userLabel(user)} {user.firstName && <span className="font-normal text-muted">· {user.firstName}</span>}
          </p>
          <p className="text-[10px] text-muted">Баланс: {formatSom(user.balance)} · Сделок: {user._count?.soldItems ?? 0}</p>
          {/* 3-band: Telegram ID endi HAR DOIM ko'rinadi, accordion'ni ochish shart emas */}
          <button onClick={copyId} className="mt-1 flex items-center gap-1 font-mono text-[10px] text-accent">
            <Copy size={10} /> ID: {String(user.telegramId)}
          </button>
        </div>
        <div role="button" tabIndex={0} onClick={toggle} onKeyDown={(e) => e.key === 'Enter' && toggle()} className="flex shrink-0 flex-col items-end gap-1">
          {user.isBanned && <span className="rounded bg-danger/15 px-1.5 py-0.5 text-[9px] font-semibold text-danger">БАН</span>}
          {(user.role === 'ADMIN' || user.role === 'SUPERADMIN') && (
            <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold text-accent">{user.role}</span>
          )}
        </div>
      </div>

      {expanded && detail && (
        <div className="space-y-2 border-t border-border p-3">
          <div className="flex gap-2">
            {!showSaleForm && (
              <button
                onClick={() => setShowSaleForm(true)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted"
              >
                <Plus size={13} /> Продажа
              </button>
            )}
            {!showDiscountForm && (
              <button
                onClick={() => setShowDiscountForm(true)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed border-success/40 px-3 py-1.5 text-xs text-success"
              >
                <Gift size={13} /> Скидка
              </button>
            )}
            {!showBanForm && (
              detail.isBanned ? (
                <button
                  onClick={unban}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-success/40 px-3 py-1.5 text-xs text-success"
                >
                  <ShieldOff size={13} /> Разбан
                </button>
              ) : (
                <button
                  onClick={() => setShowBanForm(true)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed border-danger/40 px-3 py-1.5 text-xs text-danger"
                >
                  <Ban size={13} /> Бан
                </button>
              )
            )}
          </div>

          {showSaleForm && (
            <div className="relative">
              <button onClick={() => setShowSaleForm(false)} className="absolute -right-1 -top-1 text-muted"><X size={14} /></button>
              <RecordSaleForm userId={user.id} onDone={refreshDetail} />
            </div>
          )}
          {showDiscountForm && (
            <div className="relative">
              <button onClick={() => setShowDiscountForm(false)} className="absolute -right-1 -top-1 text-muted"><X size={14} /></button>
              <DiscountForm userId={user.id} onDone={refreshDetail} />
            </div>
          )}
          {showBanForm && (
            <div className="relative">
              <button onClick={() => setShowBanForm(false)} className="absolute -right-1 -top-1 text-muted"><X size={14} /></button>
              <BanForm userId={user.id} onDone={refreshDetail} />
            </div>
          )}

          {detail.discounts?.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Активные скидки</p>
              {detail.discounts.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-md bg-success/10 px-2.5 py-1.5 text-xs">
                  <span className="text-ink">{Number(d.percent)}% скидка</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-muted">{d.remainingUses}/{d.totalUses} раз</span>
                    <button
                      onClick={async () => {
                        const ok = await showConfirm('Удалить эту скидку?');
                        if (!ok) return;
                        await api.delete(`/admin/discounts/${d.id}`);
                        refreshDetail();
                      }}
                      className="text-muted hover:text-danger"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
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

// 1/5-band: bitta ro'yxatda — muddati YETGANLAR yuqorida (yashil, tugma
// faol), hali kutilayotganlar pastda. Endi o'chirish tugmasi va sotuvchi
// profiliga o'tish havolasi ham bor.
function PayoutRow({ sale, onPaid, onCancelled, onOpenProfile }) {
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const label = sale.seller.username ? `@${sale.seller.username}` : String(sale.seller.telegramId);

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

  async function cancel(e) {
    e.stopPropagation();
    const ok = await showConfirm(`Отменить запись «${sale.itemName}»? Начисленный рейтинг будет снят.`);
    if (!ok) return;
    setCancelling(true);
    try {
      await api.delete(`/admin/sales/${sale.id}`);
      showAlert('🗑 Запись отменена.');
      onCancelled();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Произошла ошибка.');
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className={`rounded-lg border p-3 ${sale.ready ? 'border-success/40 bg-success/5' : 'border-border opacity-70'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink">{sale.itemName}</p>
          <div className="mt-0.5 flex items-center gap-2">
            <button onClick={() => onOpenProfile(sale.seller.id)} className="text-[11px] text-accent underline">
              {label}
            </button>
            {/* 4-band: to'g'ridan-to'g'ri shu foydalanuvchi bilan Telegram
                chatini ochish. DIQQAT: bu faqat Telegram bu ID'ni "tanigan"
                (masalan avval yozishgan yoki umumiy guruhda bo'lgan) hollarda
                ishonchli ochiladi — butunlay begona ID uchun ba'zan
                "foydalanuvchi topilmadi" chiqishi mumkin, bu Telegram'ning
                o'zining cheklovi. */}
            <a href={`tg://user?id=${sale.seller.telegramId}`} className="flex items-center gap-0.5 text-[11px] text-accent">
              <MessageCircle size={11} /> Написать
            </a>
          </div>
          <span className="text-[11px] text-muted">{formatSom(sale.agreedAmount)}</span>
        </div>
        <button onClick={cancel} disabled={cancelling} className="shrink-0 text-muted hover:text-danger disabled:opacity-50">
          <Trash2 size={14} />
        </button>
      </div>
      {sale.ready ? (
        <>
          <p className="mt-0.5 text-[10px] text-success">✅ Готово к оплате — 8 дней прошло</p>
          <button
            onClick={markPaid}
            disabled={paying}
            className="mt-2 w-full rounded-md bg-success py-1.5 text-xs font-semibold text-black disabled:opacity-50"
          >
            {paying ? 'Сохранение…' : '💸 Отметить как оплачено'}
          </button>
        </>
      ) : (
        <p className="mt-0.5 text-[10px] text-warning">⏳ Осталось {sale.daysLeft} дн. до защиты сделки</p>
      )}
    </div>
  );
}

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState(null);
  const [payouts, setPayouts] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [focusUserId, setFocusUserId] = useState(null);

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
    // 1-band: jami ko'pi bilan 5ta, eng eskisidan boshlab (ready avval, keyin pending)
    setPayouts([...readyItems, ...pendingItems].slice(0, 5));
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

  // 2-band: har 10 soniyada avtomatik yangilanish — faqat sahifa faol
  // (ko'rinib turgan) tabda bo'lganda, ortiqcha server yukini oldini olish
  // uchun. useRef orqali — hozirgi qidiruv matni bilan doim yangilanib
  // turishi uchun (eski "stale closure" muammosisiz).
  const refreshAllRef = useRef(refreshAll);
  refreshAllRef.current = refreshAll;
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refreshAllRef.current();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // 5-band: to'lov yozuvidagi sotuvchi nomiga bosilganda, shu foydalanuvchi
  // qidiruvda ko'rinadigan qilinadi va kartasi avtomatik ochiladi.
  function openProfile(userId) {
    setSearch('');
    setFocusUserId(userId);
    setTimeout(() => {
      document.getElementById(`user-${userId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  }

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
            {payouts.map((s) => (
              <PayoutRow
                key={s.id}
                sale={s}
                onPaid={() => { loadPayouts(); loadUsers(); }}
                onCancelled={() => { loadPayouts(); loadUsers(); }}
                onOpenProfile={openProfile}
              />
            ))}
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
            placeholder="Поиск по имени, username или Telegram ID…"
            className="w-full bg-transparent text-xs text-ink placeholder:text-muted focus:outline-none"
          />
        </div>
        {users === null ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-surface" />)}</div>
        ) : users.length ? (
          <div className="space-y-2">
            {users.map((u) => (
              <UserCard key={u.id} user={u} onChanged={loadPayouts} autoExpand={u.id === focusUserId} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted">Никого не найдено.</p>
        )}
      </section>
    </div>
  );
}

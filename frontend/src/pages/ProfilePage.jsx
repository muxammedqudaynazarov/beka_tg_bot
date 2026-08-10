import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, ShieldCheck, FileText, LifeBuoy, ChevronRight, Link2, Clock, CheckCircle2, Heart, Tag, Sparkles } from 'lucide-react';
import { api } from '../api';
import AdBanner from '../components/AdBanner';
import { useAuth } from '../AuthContext';
import { openLink, showAlert, hapticNotification } from '../telegram';
import { formatSom, RARITY_META } from '../constants';
import { useCountdownDHMS } from '../hooks/useCountdown';
import RarityBadge from '../components/RarityBadge';

const STEAM_TRADE_URL_RE = /^https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=\d+&token=[\w-]+$/;

function AwaitingPaymentRow({ auction, onPaid }) {
  const countdown = useCountdownDHMS(auction.paymentDueAt);
  const [paying, setPaying] = useState(false);
  const [claiming, setClaiming] = useState(false);

  async function completePayment() {
    setPaying(true);
    try {
      await api.post(`/auctions/${auction.id}/complete-payment`);
      hapticNotification('success');
      onPaid();
    } catch (err) {
      hapticNotification('error');
      showAlert(err.response?.data?.error || 'Не удалось завершить оплату.');
    } finally {
      setPaying(false);
    }
  }

  // 10-band: g'olib to'liq to'lagan skinni o'zi xohlagan vaqtda ushbu tugma
  // orqali Steam'ga chiqarib olishi mumkin — hech kim uni majburlamaydi.
  async function claim() {
    setClaiming(true);
    try {
      const { data } = await api.post(`/auctions/${auction.id}/claim`);
      hapticNotification('success');
      showAlert(data.message);
      onPaid();
    } catch (err) {
      hapticNotification('error');
      showAlert(err.response?.data?.error || 'Не удалось отправить запрос.');
    } finally {
      setClaiming(false);
    }
  }

  if (auction.status === 'PAID') {
    return (
      <div className="rounded-xl bg-base-surface px-3.5 py-3">
        <p className="font-display text-xs font-semibold text-ink-primary">{auction.skinName}</p>
        <p className="mt-1 flex items-center gap-1 text-[11px] text-signal-success">
          <CheckCircle2 size={12} /> Оплачено — заберите в удобное время
        </p>
        <button
          onClick={claim}
          disabled={claiming}
          className="mt-2 w-full rounded-lg bg-signal-success py-2 font-display text-xs font-bold text-black disabled:opacity-50"
        >
          {claiming ? 'Отправка…' : '📦 Отправить в Steam'}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-signal-warning/40 bg-signal-warning/5 px-3.5 py-3">
      <p className="font-display text-xs font-semibold text-ink-primary">{auction.skinName}</p>
      <p className="mt-1 flex items-center gap-1 font-mono text-[11px] text-signal-warning">
        <Clock size={11} /> Оплатите в течение <span key={countdown} className="countdown-flash">{countdown}</span>
      </p>
      <button
        onClick={completePayment}
        disabled={paying}
        className="mt-2 w-full rounded-lg bg-signal-warning py-2 font-display text-xs font-bold text-black disabled:opacity-50"
      >
        {paying ? 'Загрузка…' : 'Завершить оплату'}
      </button>
    </div>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const [purchases, setPurchases] = useState(null);
  const [links, setLinks] = useState(null);
  const [awaiting, setAwaiting] = useState(null);
  const [favorites, setFavorites] = useState(null);
  const [tradeUrl, setTradeUrl] = useState('');
  const [savingTradeUrl, setSavingTradeUrl] = useState(false);

  function loadAll() {
    api.get('/profile').then(({ data }) => {
      setPurchases(data.purchases || []);
      setLinks(data.links);
      setTradeUrl(data.user.tradeUrl || '');
    });
    api.get('/auctions/mine/awaiting-payment').then(({ data }) => setAwaiting(data.items || []));
    api.get('/favorites').then(({ data }) => setFavorites(data.items || []));
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function saveTradeUrl() {
    const trimmed = tradeUrl.trim();
    if (trimmed && !STEAM_TRADE_URL_RE.test(trimmed)) {
      showAlert(
        'Неверный формат Trade URL. Скопируйте правильную ссылку в настройках Steam: Инвентарь → Обмены.'
      );
      return;
    }
    setSavingTradeUrl(true);
    try {
      const { data } = await api.patch('/profile/trade-url', { tradeUrl: trimmed });
      hapticNotification('success');
      await refreshProfile();
      if (data.warning) {
        showAlert(data.warning);
      } else if (trimmed) {
        showAlert('✅ Trade URL сохранён и проверен — ссылка действительна.');
      }
    } catch (err) {
      showAlert(err.response?.data?.error || 'Ошибка при сохранении.');
    } finally {
      setSavingTradeUrl(false);
    }
  }

  const loading = purchases === null || awaiting === null;

  if (loading) {
    return (
      <div className="min-h-screen px-4 pb-28 pt-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="h-14 w-14 animate-pulse rounded-full bg-base-surface" />
          <div className="space-y-2">
            <div className="h-3.5 w-28 animate-pulse rounded bg-base-surface" />
            <div className="h-3 w-20 animate-pulse rounded bg-base-surface" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="h-16 animate-pulse rounded-xl bg-base-surface" />
          <div className="h-16 animate-pulse rounded-xl bg-base-surface" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 pb-28 pt-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-rarity-restricted to-rarity-covert font-display text-lg font-bold text-white">
          {(user?.firstName || 'U')[0]}
        </div>
        <div>
          <p className="font-display text-base font-bold text-ink-primary">{user?.firstName || 'Пользователь'}</p>
          <p className="text-xs text-ink-secondary">@{user?.username || 'нет username'}</p>
        </div>
      </div>

      <AdBanner />

      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-base-surface p-3.5">
          <p className="text-[10px] uppercase tracking-wide text-ink-secondary">Баланс</p>
          <p className="mt-1 font-mono text-base font-bold text-ink-primary">{formatSom(user?.balance)}</p>
        </div>
        <div className="rounded-xl bg-base-surface p-3.5">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-ink-secondary">
            <Star size={10} /> Рейтинг
          </div>
          <p className="mt-1 font-mono text-base font-bold text-ink-primary">{user?.ratingScore ?? 0}</p>
        </div>
      </div>

      {Number(user?.discountPct) > 0 && (
        <div className="mb-6 flex items-center gap-2 rounded-xl bg-signal-success/10 px-3.5 py-2.5 text-xs text-signal-success">
          <ShieldCheck size={14} />
          Администратор предоставил вам скидку <strong>{user.discountPct}%</strong>
        </div>
      )}

      {/* 4-band: Trade URL */}
      <h2 className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-ink-secondary">
        Steam Trade URL
      </h2>
      <div className="mb-6 space-y-2">
        <div className="flex items-center gap-2 rounded-xl border border-base-border bg-base-surface px-3 py-2.5">
          <Link2 size={14} className="shrink-0 text-ink-muted" />
          <input
            value={tradeUrl}
            onChange={(e) => setTradeUrl(e.target.value)}
            placeholder="https://steamcommunity.com/tradeoffer/new/?partner=...&token=..."
            className="w-full min-w-0 bg-transparent font-mono text-[11px] text-ink-primary placeholder:text-ink-muted focus:outline-none"
          />
        </div>
        <button
          onClick={saveTradeUrl}
          disabled={savingTradeUrl}
          className="w-full rounded-lg bg-base-surface2 py-2 font-display text-xs font-semibold text-ink-primary disabled:opacity-50"
        >
          {savingTradeUrl ? 'Сохранение…' : 'Сохранить'}
        </button>
        <p className="text-[10px] text-ink-muted">
          Выигранный скин будет отправлен на этот адрес в ваш инвентарь Steam. Найти его можно в Steam:
          Инвентарь &gt; Обмены &gt; настройки предложений обмена.
        </p>
      </div>

      {/* 3-band: Избранное */}
      {favorites?.length > 0 && (
        <>
          <h2 className="mb-2 flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wide text-ink-secondary">
            <Heart size={12} className="text-rarity-covert" fill="currentColor" /> Избранное
          </h2>
          <div className="mb-6 grid grid-cols-3 gap-2">
            {favorites.map((a) => (
              <button
                key={a.id}
                onClick={() => navigate(`/auction/${a.id}`)}
                className="rounded-lg bg-base-surface p-2 text-left"
              >
                <div className="aspect-square rounded-md bg-base-surface2">
                  <img src={a.imageUrl} alt={a.skinName} className="h-full w-full object-contain p-1.5" />
                </div>
                <p className="mt-1 truncate text-[10px] font-medium text-ink-primary">{a.skinName}</p>
                <p className="font-mono text-[10px] font-bold text-ink-secondary">{formatSom(a.currentPrice)}</p>
              </button>
            ))}
          </div>
        </>
      )}

      {/* 3/8-band: to'lov kutilayotgan g'alabalar */}
      {awaiting.length > 0 && (
        <>
          <h2 className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-ink-secondary">
            Победы, ожидающие оплаты
          </h2>
          <div className="mb-6 space-y-2">
            {awaiting.map((a) => (
              <AwaitingPaymentRow key={a.id} auction={a} onPaid={loadAll} />
            ))}
          </div>
        </>
      )}

      <h2 className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-ink-secondary">
        Купленные скины
      </h2>
      {purchases.length ? (
        <div className="mb-6 space-y-2">
          {purchases.map((p) => {
            const a = p.auction;
            if (!a) return null;
            const meta = RARITY_META[a.rarity] || RARITY_META.CONSUMER;
            return (
              <button
                key={p.id}
                onClick={() => navigate(`/auction/${a.id}`)}
                className="flex w-full items-center gap-3 rounded-lg bg-base-surface px-2.5 py-2.5 text-left"
                style={{ borderLeft: `3px solid ${meta.color}`, backgroundImage: `linear-gradient(90deg, ${meta.color}14, transparent 45%)` }}
              >
                <div className="h-14 w-14 shrink-0 rounded-md bg-base-surface2">
                  <img src={a.imageUrl} alt={a.skinName} className="h-full w-full object-contain p-1.5" style={{ filter: `drop-shadow(0 0 8px ${meta.color}33)` }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-1.5">
                    <RarityBadge rarity={a.rarity} />
                    {a.wearCondition && (
                      <span className="rounded bg-rarity-milspec/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-rarity-milspec">
                        {a.wearCondition}
                      </span>
                    )}
                    {a.floatValue !== null && a.floatValue !== undefined && (
                      <span className="truncate font-mono text-[10px] text-ink-muted">{Number(a.floatValue).toFixed(4)}</span>
                    )}
                  </div>
                  <h3 className="truncate font-display text-[13px] font-semibold leading-tight text-ink-primary">{a.skinName}</h3>
                  <p className="mt-0.5 text-[10px] text-ink-muted">{new Date(p.createdAt).toLocaleDateString('ru-RU')}</p>
                </div>
                <p className="shrink-0 font-mono text-[13px] font-bold" style={{ color: meta.color }}>{formatSom(p.amount)}</p>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mb-6 text-xs text-ink-muted">Пока нет купленных скинов.</p>
      )}

      {/* 4-band: "Skin sotmoqchimisiz?" — pastroq qismda, chiroyli animatsiya bilan */}
      {links?.supportGroupUrl && (
        <div className="relative mb-6 overflow-hidden rounded-2xl border border-rarity-restricted/30 bg-gradient-to-br from-base-surface to-base-surface2 p-4">
          <div className="animate-breathe absolute -right-6 -top-6 h-24 w-24 rounded-full bg-rarity-restricted/30 blur-2xl" />
          <div className="relative flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rarity-restricted/15">
              <Tag size={18} className="text-rarity-restricted" />
            </div>
            <div className="flex-1">
              <p className="font-display text-sm font-bold text-ink-primary">
                У вас есть скин, хотите продать? <Sparkles size={13} className="ml-0.5 inline text-rarity-gold" />
              </p>
              <p className="mt-0.5 text-[11px] text-ink-secondary">
                Свяжитесь с нами — поможем выставить ваш скин на аукцион.
              </p>
              <button
                onClick={() => openLink(links.supportGroupUrl)}
                className="mt-2.5 rounded-full bg-rarity-restricted px-4 py-1.5 font-display text-xs font-bold text-white"
              >
                Да, хочу
              </button>
            </div>
          </div>
        </div>
      )}

      <h2 className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-ink-secondary">Другое</h2>
      <div className="divide-y divide-base-border overflow-hidden rounded-xl bg-base-surface">
        <button
          onClick={() => navigate('/privacy')}
          className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-xs text-ink-primary"
        >
          <FileText size={14} className="text-ink-secondary" />
          Политика конфиденциальности
          <ChevronRight size={14} className="ml-auto text-ink-muted" />
        </button>
        {links?.supportGroupUrl && (
          <button
            onClick={() => openLink(links.supportGroupUrl)}
            className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-xs text-ink-primary"
          >
            <LifeBuoy size={14} className="text-ink-secondary" />
            Помощь / Поддержка
            <ChevronRight size={14} className="ml-auto text-ink-muted" />
          </button>
        )}
      </div>
    </div>
  );
}

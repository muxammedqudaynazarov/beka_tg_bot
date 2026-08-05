import { useEffect, useState } from 'react';
import { Star, ShieldCheck, FileText, LifeBuoy, ChevronRight, Link2, Clock, CheckCircle2 } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { openLink, showAlert, hapticNotification } from '../telegram';
import { formatSom } from '../constants';
import { useCountdownDHMS } from '../hooks/useCountdown';

const STEAM_TRADE_URL_RE = /^https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=\d+&token=[\w-]+$/;

function AwaitingPaymentRow({ auction, onPaid }) {
  const countdown = useCountdownDHMS(auction.paymentDueAt);
  const [paying, setPaying] = useState(false);

  async function completePayment() {
    setPaying(true);
    try {
      await api.post(`/auctions/${auction.id}/complete-payment`);
      hapticNotification('success');
      onPaid();
    } catch (err) {
      hapticNotification('error');
      showAlert(err.response?.data?.error || 'To\'lovni yakunlab bo\'lmadi.');
    } finally {
      setPaying(false);
    }
  }

  if (auction.status === 'PAID') {
    return (
      <div className="rounded-xl bg-base-surface px-3.5 py-3">
        <p className="font-display text-xs font-semibold text-ink-primary">{auction.skinName}</p>
        <p className="mt-1 flex items-center gap-1 text-[11px] text-signal-success">
          <CheckCircle2 size={12} /> To'landi — Steam orqali yuborilishini kuting
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-signal-warning/40 bg-signal-warning/5 px-3.5 py-3">
      <p className="font-display text-xs font-semibold text-ink-primary">{auction.skinName}</p>
      <p className="mt-1 flex items-center gap-1 font-mono text-[11px] text-signal-warning">
        <Clock size={11} /> {countdown} ichida to'lang
      </p>
      <button
        onClick={completePayment}
        disabled={paying}
        className="mt-2 w-full rounded-lg bg-signal-warning py-2 font-display text-xs font-bold text-black disabled:opacity-50"
      >
        {paying ? 'Yuklanmoqda…' : 'To\'lovni yakunlash'}
      </button>
    </div>
  );
}

export default function ProfilePage() {
  const { user, refreshProfile } = useAuth();
  const [purchases, setPurchases] = useState(null);
  const [links, setLinks] = useState(null);
  const [awaiting, setAwaiting] = useState(null);
  const [tradeUrl, setTradeUrl] = useState('');
  const [savingTradeUrl, setSavingTradeUrl] = useState(false);

  function loadAll() {
    api.get('/profile').then(({ data }) => {
      setPurchases(data.purchases || []);
      setLinks(data.links);
      setTradeUrl(data.user.tradeUrl || '');
    });
    api.get('/auctions/mine/awaiting-payment').then(({ data }) => setAwaiting(data.items || []));
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function saveTradeUrl() {
    const trimmed = tradeUrl.trim();
    if (trimmed && !STEAM_TRADE_URL_RE.test(trimmed)) {
      showAlert(
        'Trade URL formati noto\'g\'ri. Steam > Inventar > Trade takliflari sozlamalaridan to\'g\'ri havolani nusxalang.'
      );
      return;
    }
    setSavingTradeUrl(true);
    try {
      await api.patch('/profile/trade-url', { tradeUrl: trimmed });
      hapticNotification('success');
      await refreshProfile();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Saqlashda xatolik yuz berdi.');
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
          <p className="font-display text-base font-bold text-ink-primary">{user?.firstName || 'Foydalanuvchi'}</p>
          <p className="text-xs text-ink-secondary">@{user?.username || 'username yo\'q'}</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-base-surface p-3.5">
          <p className="text-[10px] uppercase tracking-wide text-ink-secondary">Balans</p>
          <p className="mt-1 font-mono text-base font-bold text-ink-primary">{formatSom(user?.balance)}</p>
        </div>
        <div className="rounded-xl bg-base-surface p-3.5">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-ink-secondary">
            <Star size={10} /> Reyting
          </div>
          <p className="mt-1 font-mono text-base font-bold text-ink-primary">{user?.ratingScore ?? 0}</p>
        </div>
      </div>

      {Number(user?.discountPct) > 0 && (
        <div className="mb-6 flex items-center gap-2 rounded-xl bg-signal-success/10 px-3.5 py-2.5 text-xs text-signal-success">
          <ShieldCheck size={14} />
          Sizga admin tomonidan <strong>{user.discountPct}%</strong> skidka berilgan
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
          {savingTradeUrl ? 'Saqlanmoqda…' : 'Saqlash'}
        </button>
        <p className="text-[10px] text-ink-muted">
          Yutgan skiningiz shu havola orqali Steam inventaringizga yuboriladi. Steam &gt; Inventar &gt; Trade takliflari
          sozlamalaridan topasiz.
        </p>
      </div>

      {/* 3/8-band: to'lov kutilayotgan g'alabalar */}
      {awaiting.length > 0 && (
        <>
          <h2 className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-ink-secondary">
            To'lov kutilayotgan g'alabalar
          </h2>
          <div className="mb-6 space-y-2">
            {awaiting.map((a) => (
              <AwaitingPaymentRow key={a.id} auction={a} onPaid={loadAll} />
            ))}
          </div>
        </>
      )}

      <h2 className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-ink-secondary">
        Sotib olingan skinlar
      </h2>
      {purchases.length ? (
        <div className="mb-6 space-y-2">
          {purchases.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-xl bg-base-surface px-3.5 py-3">
              <div>
                <p className="font-display text-xs font-semibold text-ink-primary">{p.auction?.skinName}</p>
                <p className="text-[10px] text-ink-muted">{new Date(p.createdAt).toLocaleDateString('uz-UZ')}</p>
              </div>
              <p className="font-mono text-xs font-bold text-ink-primary">{formatSom(p.amount)}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-6 text-xs text-ink-muted">Hali sotib olingan skinlar yo'q.</p>
      )}

      <h2 className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-ink-secondary">Boshqa</h2>
      <div className="divide-y divide-base-border overflow-hidden rounded-xl bg-base-surface">
        <button
          onClick={() => links && openLink(links.privacyPolicy)}
          className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-xs text-ink-primary"
        >
          <FileText size={14} className="text-ink-secondary" />
          Maxfiylik siyosati
          <ChevronRight size={14} className="ml-auto text-ink-muted" />
        </button>
        <button
          onClick={() => links && openLink(links.supportBot)}
          className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-xs text-ink-primary"
        >
          <LifeBuoy size={14} className="text-ink-secondary" />
          Yordam / Qo'llab-quvvatlash
          <ChevronRight size={14} className="ml-auto text-ink-muted" />
        </button>
      </div>
    </div>
  );
}

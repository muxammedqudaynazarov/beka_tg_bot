import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Gavel, Lock, TrendingUp, Clock, CheckCircle2, XCircle, Zap, Heart } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { useAuctionSocket } from '../hooks/useAuctionSocket';
import { useCountdownDHMS } from '../hooks/useCountdown';
import { hapticNotification, showAlert } from '../telegram';
import RarityBadge from '../components/RarityBadge';
import FloatGauge from '../components/FloatGauge';
import { WEAR_LABELS, formatSom, AUCTION_STATUS_META, RARITY_META } from '../constants';

const DEPOSIT_PERCENT = 25; // backend .env AUCTION_DEPOSIT_PERCENT bilan mos — faqat ko'rsatish uchun
const MAX_CONSECUTIVE = 10;

function PaymentPanel({ auction, isLeader, onChanged }) {
  const [paying, setPaying] = useState(false);
  const dueCountdown = useCountdownDHMS(auction.paymentDueAt || auction.endsAt);

  async function completePayment() {
    setPaying(true);
    try {
      await api.post(`/auctions/${auction.id}/complete-payment`);
      hapticNotification('success');
      onChanged();
    } catch (err) {
      hapticNotification('error');
      showAlert(err.response?.data?.error || 'Не удалось завершить оплату.');
    } finally {
      setPaying(false);
    }
  }

  if (auction.status === 'AWAITING_PAYMENT') {
    if (!isLeader) {
      return (
        <div className="rounded-2xl border border-signal-warning/40 bg-signal-warning/5 p-4 text-center text-xs text-signal-warning">
          <Clock size={16} className="mx-auto mb-1" />
          Ожидается завершение оплаты победителем.
        </div>
      );
    }
    return (
      <div className="space-y-2.5 rounded-2xl border border-signal-warning/40 bg-signal-warning/5 p-4">
        <p className="text-center text-xs text-signal-warning">
          <Clock size={13} className="mr-1 inline" />
          Завершите оплату в течение <span key={dueCountdown} className="countdown-flash font-mono font-bold">{dueCountdown}</span>
        </p>
        <button
          onClick={completePayment}
          disabled={paying}
          className="w-full rounded-xl bg-signal-warning py-3 font-display text-sm font-bold text-black disabled:opacity-50"
        >
          {paying ? 'Загрузка…' : 'Завершить оплату'}
        </button>
      </div>
    );
  }

  if (auction.status === 'PAID') {
    return (
      <div className="rounded-2xl border border-signal-success/40 bg-signal-success/5 p-4 text-center text-xs text-signal-success">
        <CheckCircle2 size={16} className="mx-auto mb-1" />
        {isLeader ? 'Оплата принята — ожидайте отправки через Steam.' : 'Этот аукцион оплачен.'}
      </div>
    );
  }

  if (auction.status === 'DELIVERED') {
    return (
      <div className="rounded-2xl border border-signal-success/40 bg-signal-success/5 p-4 text-center text-xs text-signal-success">
        <CheckCircle2 size={16} className="mx-auto mb-1" />
        Скин отправлен победителю через Steam.
      </div>
    );
  }

  if (auction.status === 'PAYMENT_EXPIRED') {
    return (
      <div className="rounded-2xl border border-signal-danger/40 bg-signal-danger/5 p-4 text-center text-xs text-signal-danger">
        <XCircle size={16} className="mx-auto mb-1" />
        Срок оплаты истёк, скин возвращён.
      </div>
    );
  }

  if (auction.status === 'CANCELLED' || auction.status === 'UNSOLD') {
    return (
      <div className="rounded-2xl border border-base-border bg-base-surface p-4 text-center text-xs text-ink-secondary">
        {auction.status === 'CANCELLED' ? 'Этот аукцион отменён.' : 'На этот аукцион никто не сделал ставку.'}
      </div>
    );
  }

  return null;
}

export default function AuctionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();

  const [auction, setAuction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [customAmount, setCustomAmount] = useState('');
  const [placing, setPlacing] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [favBusy, setFavBusy] = useState(false);

  const load = useCallback(() => {
    api.get(`/auctions/${id}`).then(({ data }) => setAuction(data)).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useAuctionSocket(id, {
    onUpdate: (payload) => {
      setAuction((prev) =>
        prev ? { ...prev, currentPrice: payload.currentPrice, currentLeader: payload.currentLeader, endsAt: payload.endsAt } : prev
      );
      setPulse(true);
      setTimeout(() => setPulse(false), 400);
      load(); // taklif tarixini ham yangilash uchun to'liq qayta yuklaymiz
    },
    onClosed: () => load(),
  });

  const countdownLabel = useCountdownDHMS(auction?.endsAt || new Date().toISOString());

  if (loading || !auction) {
    return (
      <div className="min-h-screen px-4 pt-6">
        <div className="mb-4 h-5 w-32 animate-pulse rounded bg-base-surface" />
        <div className="aspect-[4/3] w-full animate-pulse rounded-xl bg-base-surface" />
        <div className="mt-4 h-20 w-full animate-pulse rounded-xl bg-base-surface" />
      </div>
    );
  }

  const isLeader = auction.currentLeaderId === user?.id;
  const currentPrice = Number(auction.currentPrice);
  const rarityMeta = RARITY_META[auction.rarity] || RARITY_META.CONSUMER;
  const suggestedStep = Math.max(Math.round(currentPrice * 0.05), 1000);
  const nextRaiseAmount = currentPrice + suggestedStep;
  const requiredDeposit = Math.round((nextRaiseAmount * DEPOSIT_PERCENT) / 100);
  const isBiddingOpen = auction.status === 'ACTIVE' && new Date(auction.endsAt).getTime() > Date.now();
  const consecutiveBlocked = isLeader && auction.consecutiveRaises >= MAX_CONSECUTIVE;
  const statusMeta = AUCTION_STATUS_META[auction.status];

  async function submitBid(mode, amount) {
    setPlacing(true);
    try {
      await api.post(`/auctions/${id}/bid`, { mode, amount, raiseStep: suggestedStep });
      hapticNotification('success');
      await refreshProfile();
      setCustomAmount('');
    } catch (err) {
      hapticNotification('error');
      showAlert(err.response?.data?.error || 'Ошибка при размещении ставки.');
    } finally {
      setPlacing(false);
    }
  }

  async function toggleFavorite() {
    setFavBusy(true);
    try {
      const { data } = await api.post(`/favorites/${id}`);
      setAuction((prev) => (prev ? { ...prev, isFavorited: data.favorited } : prev));
      hapticNotification('success');
    } catch (err) {
      showAlert(err.response?.data?.error || 'Не удалось обновить избранное.');
    } finally {
      setFavBusy(false);
    }
  }

  return (
    <div className="min-h-screen pb-28">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-base-border bg-base-bg/95 px-4 py-3.5 backdrop-blur">
        <button onClick={() => navigate(-1)} className="text-ink-secondary">
          <ChevronLeft size={20} />
        </button>
        <h1 className="truncate font-display text-sm font-bold text-ink-primary">{auction.skinName}</h1>
      </header>

      <div
        className="relative mx-4 mt-4 flex aspect-[4/3] items-center justify-center bg-base-surface"
        style={{ border: `2px solid ${rarityMeta.color}`, borderRadius: '16px', overflow: 'hidden' }}
      >
        <img src={auction.imageUrl} alt={auction.skinName} className="h-full w-full object-contain p-8" />
        <button
          onClick={toggleFavorite}
          disabled={favBusy}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 backdrop-blur transition-transform active:scale-90"
        >
          <Heart
            size={18}
            className={auction.isFavorited ? 'text-rarity-covert' : 'text-white'}
            fill={auction.isFavorited ? 'currentColor' : 'none'}
          />
        </button>
      </div>

      <div className="space-y-4 px-4 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <RarityBadge rarity={auction.rarity} size="md" />
          {auction.isStatTrak && (
            <span className="flex items-center gap-1 rounded-full border border-black/30 bg-gradient-to-br from-amber-400 to-orange-600 px-2.5 py-0.5 shadow-[0_2px_6px_rgba(0,0,0,0.4)]">
              <Zap size={11} className="text-black/75" fill="currentColor" />
              <span className="font-display text-[10px] font-black tracking-tight text-black/80">StatTrak™</span>
            </span>
          )}
          <span className="font-mono text-[10px] text-ink-secondary">{WEAR_LABELS[auction.wearCondition]}</span>
          {statusMeta && auction.status !== 'ACTIVE' && (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
              style={{ color: statusMeta.color, backgroundColor: `${statusMeta.color}1A` }}
            >
              {statusMeta.label}
            </span>
          )}
        </div>

        <div className="rounded-2xl bg-base-surface p-4">
          <FloatGauge value={auction.floatValue} />
          {auction.paintSeed !== null && auction.paintSeed !== undefined && (
            <p className="mt-3 flex items-center justify-between border-t border-base-border pt-3 text-xs">
              <span className="text-ink-secondary">Шаблон раскраски</span>
              <span className="font-mono font-bold text-ink-primary">#{auction.paintSeed}</span>
            </p>
          )}
        </div>

        {auction.stickers?.length > 0 && (
          <div>
            <h2 className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-ink-secondary">
              Наклейки
            </h2>
            <div className="grid grid-cols-5 gap-2">
              {auction.stickers.map((s) => (
                <div key={s.id} className="flex flex-col items-center gap-1 rounded-lg bg-base-surface p-1.5">
                  <img src={s.imageUrl} alt={s.name} className="h-10 w-10 object-contain" />
                  <span className="w-full truncate text-center text-[8px] text-ink-muted">{s.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-base-surface p-4 shadow-glow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-ink-secondary">Текущая цена</p>
              <p className={`font-mono text-2xl font-bold text-ink-primary ${pulse ? 'animate-pulse-price' : ''}`}>
                {formatSom(auction.currentPrice)}
              </p>
            </div>
            {isBiddingOpen && (
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wide text-ink-secondary">Осталось времени</p>
                <p className="font-mono text-base font-bold tabular-nums text-signal-danger">
                  <span key={countdownLabel} className="countdown-flash">{countdownLabel}</span>
                </p>
              </div>
            )}
          </div>
          {auction.currentLeader && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-secondary">
              <TrendingUp size={12} />
              Лидер:{' '}
              <span className="font-semibold text-ink-primary">
                {isLeader ? 'Вы' : auction.currentLeader.username ? `@${auction.currentLeader.username}` : auction.currentLeader.firstName}
              </span>
            </p>
          )}
        </div>

        {isBiddingOpen ? (
          <div className="space-y-3 rounded-2xl border border-base-border p-4">
            <div className="flex items-center gap-1.5 text-[11px] text-ink-secondary">
              <Lock size={11} />
              За каждую ставку с вашего баланса удерживается {DEPOSIT_PERCENT}% от цены в качестве залога.
            </div>

            <button
              disabled={placing || consecutiveBlocked}
              onClick={() => submitBid('raise')}
              className="flex w-full items-center justify-between rounded-xl bg-rarity-covert px-4 py-3 font-display text-sm font-bold text-white disabled:opacity-40"
            >
              <span className="flex items-center gap-2">
                <Gavel size={15} /> Повысить цену
              </span>
              <span className="font-mono">{formatSom(nextRaiseAmount)}</span>
            </button>
            <p className="text-center text-[10px] text-ink-muted">
              Залог: ~{formatSom(requiredDeposit)}
              {isLeader && ` · Повышений подряд: ${auction.consecutiveRaises}/${MAX_CONSECUTIVE}`}
            </p>
            {consecutiveBlocked && (
              <p className="text-center text-[11px] text-signal-warning">
                Вы повысили цену {MAX_CONSECUTIVE} раз подряд на этом аукционе. Дождитесь ставки другого участника.
              </p>
            )}

            <div className="flex gap-2">
              <input
                type="number"
                inputMode="numeric"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder={`Не менее ${formatSom(currentPrice)}`}
                className="flex-1 rounded-xl border border-base-border bg-base-surface px-3 py-2 font-mono text-xs text-ink-primary placeholder:text-ink-muted focus:border-rarity-covert focus:outline-none"
              />
              <button
                disabled={placing || !customAmount || Number(customAmount) < currentPrice}
                onClick={() => submitBid('custom', Number(customAmount))}
                className="rounded-xl bg-base-surface2 px-4 py-2 font-display text-xs font-semibold text-ink-primary disabled:opacity-40"
              >
                Своя цена
              </button>
            </div>
          </div>
        ) : (
          <PaymentPanel auction={auction} isLeader={isLeader} onChanged={load} />
        )}

        <div>
          <h2 className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-ink-secondary">
            История ставок
          </h2>
          <div className="space-y-1.5">
            {(auction.bids || []).map((bid) => (
              <div key={bid.id} className="flex items-center justify-between rounded-lg bg-base-surface px-3 py-2 text-xs">
                <span className="text-ink-secondary">
                  {bid.user?.username ? `@${bid.user.username}` : bid.user?.firstName || 'Пользователь'}
                </span>
                <span className="font-mono font-semibold text-ink-primary">{formatSom(bid.amount)}</span>
              </div>
            ))}
            {!(auction.bids || []).length && (
              <p className="text-xs text-ink-muted">Пока нет ставок — сделайте первую ставку!</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

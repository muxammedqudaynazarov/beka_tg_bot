import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Gavel, Lock, TrendingUp, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { useAuctionSocket } from '../hooks/useAuctionSocket';
import { useCountdownDHMS } from '../hooks/useCountdown';
import { hapticNotification, showAlert } from '../telegram';
import RarityBadge from '../components/RarityBadge';
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
      showAlert(err.response?.data?.error || 'To\'lovni yakunlab bo\'lmadi.');
    } finally {
      setPaying(false);
    }
  }

  if (auction.status === 'AWAITING_PAYMENT') {
    if (!isLeader) {
      return (
        <div className="rounded-2xl border border-signal-warning/40 bg-signal-warning/5 p-4 text-center text-xs text-signal-warning">
          <Clock size={16} className="mx-auto mb-1" />
          G'olib qolgan to'lovni yakunlashini kutmoqda.
        </div>
      );
    }
    return (
      <div className="space-y-2.5 rounded-2xl border border-signal-warning/40 bg-signal-warning/5 p-4">
        <p className="text-center text-xs text-signal-warning">
          <Clock size={13} className="mr-1 inline" />
          Qolgan to'lovni <span key={dueCountdown} className="countdown-flash font-mono font-bold">{dueCountdown}</span> ichida yakunlang
        </p>
        <button
          onClick={completePayment}
          disabled={paying}
          className="w-full rounded-xl bg-signal-warning py-3 font-display text-sm font-bold text-black disabled:opacity-50"
        >
          {paying ? 'Yuklanmoqda…' : 'To\'lovni yakunlash'}
        </button>
      </div>
    );
  }

  if (auction.status === 'PAID') {
    return (
      <div className="rounded-2xl border border-signal-success/40 bg-signal-success/5 p-4 text-center text-xs text-signal-success">
        <CheckCircle2 size={16} className="mx-auto mb-1" />
        {isLeader ? 'To\'lov qabul qilindi — Steam orqali yuborilishini kuting.' : 'Bu auksion to\'lov qilingan.'}
      </div>
    );
  }

  if (auction.status === 'DELIVERED') {
    return (
      <div className="rounded-2xl border border-signal-success/40 bg-signal-success/5 p-4 text-center text-xs text-signal-success">
        <CheckCircle2 size={16} className="mx-auto mb-1" />
        Skin g'olibga Steam orqali yuborildi.
      </div>
    );
  }

  if (auction.status === 'PAYMENT_EXPIRED') {
    return (
      <div className="rounded-2xl border border-signal-danger/40 bg-signal-danger/5 p-4 text-center text-xs text-signal-danger">
        <XCircle size={16} className="mx-auto mb-1" />
        To'lov muddati o'tib ketdi, skin qaytarib olindi.
      </div>
    );
  }

  if (auction.status === 'CANCELLED' || auction.status === 'UNSOLD') {
    return (
      <div className="rounded-2xl border border-base-border bg-base-surface p-4 text-center text-xs text-ink-secondary">
        {auction.status === 'CANCELLED' ? 'Bu auksion bekor qilingan.' : 'Bu auksionga hech kim taklif bermadi.'}
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
      showAlert(err.response?.data?.error || 'Taklif berishda xatolik yuz berdi.');
    } finally {
      setPlacing(false);
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
        className="mx-4 mt-4 flex aspect-[4/3] items-center justify-center bg-base-surface"
        style={{ border: `2px solid ${rarityMeta.color}`, borderRadius: '16px', overflow: 'hidden' }}
      >
        <img src={auction.imageUrl} alt={auction.skinName} className="h-full w-full object-contain p-8" />
      </div>

      <div className="space-y-4 px-4 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <RarityBadge rarity={auction.rarity} size="md" />
          {auction.isStatTrak && (
            <span className="rounded bg-signal-warning/90 px-2 py-0.5 text-[10px] font-bold text-black">StatTrak™</span>
          )}
          <span className="font-mono text-[10px] text-ink-secondary">
            {WEAR_LABELS[auction.wearCondition]} · {Number(auction.floatValue).toFixed(6)}
          </span>
          {statusMeta && auction.status !== 'ACTIVE' && (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
              style={{ color: statusMeta.color, backgroundColor: `${statusMeta.color}1A` }}
            >
              {statusMeta.label}
            </span>
          )}
        </div>

        <div className="rounded-2xl bg-base-surface p-4 shadow-glow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-ink-secondary">Joriy narx</p>
              <p className={`font-mono text-2xl font-bold text-ink-primary ${pulse ? 'animate-pulse-price' : ''}`}>
                {formatSom(auction.currentPrice)}
              </p>
            </div>
            {isBiddingOpen && (
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wide text-ink-secondary">Qolgan vaqt</p>
                <p className="font-mono text-base font-bold tabular-nums text-signal-danger">
                  <span key={countdownLabel} className="countdown-flash">{countdownLabel}</span>
                </p>
              </div>
            )}
          </div>
          {auction.currentLeader && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-secondary">
              <TrendingUp size={12} />
              Yetakchi:{' '}
              <span className="font-semibold text-ink-primary">
                {isLeader ? 'Siz' : auction.currentLeader.username ? `@${auction.currentLeader.username}` : auction.currentLeader.firstName}
              </span>
            </p>
          )}
        </div>

        {isBiddingOpen ? (
          <div className="space-y-3 rounded-2xl border border-base-border p-4">
            <div className="flex items-center gap-1.5 text-[11px] text-ink-secondary">
              <Lock size={11} />
              Har bir taklif uchun narxning {DEPOSIT_PERCENT}% i zaklad sifatida hisobingizdan ushlanadi.
            </div>

            <button
              disabled={placing || consecutiveBlocked}
              onClick={() => submitBid('raise')}
              className="flex w-full items-center justify-between rounded-xl bg-rarity-covert px-4 py-3 font-display text-sm font-bold text-white disabled:opacity-40"
            >
              <span className="flex items-center gap-2">
                <Gavel size={15} /> Narxni oshirish
              </span>
              <span className="font-mono">{formatSom(nextRaiseAmount)}</span>
            </button>
            <p className="text-center text-[10px] text-ink-muted">
              Zaklad: ~{formatSom(requiredDeposit)}
              {isLeader && ` · Ketma-ket oshirish: ${auction.consecutiveRaises}/${MAX_CONSECUTIVE}`}
            </p>
            {consecutiveBlocked && (
              <p className="text-center text-[11px] text-signal-warning">
                Siz bu auksionda ketma-ket {MAX_CONSECUTIVE} marta oshirdingiz. Boshqa foydalanuvchi taklif berishini kuting.
              </p>
            )}

            <div className="flex gap-2">
              <input
                type="number"
                inputMode="numeric"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder={`Kamida ${formatSom(currentPrice)}`}
                className="flex-1 rounded-xl border border-base-border bg-base-surface px-3 py-2 font-mono text-xs text-ink-primary placeholder:text-ink-muted focus:border-rarity-covert focus:outline-none"
              />
              <button
                disabled={placing || !customAmount || Number(customAmount) < currentPrice}
                onClick={() => submitBid('custom', Number(customAmount))}
                className="rounded-xl bg-base-surface2 px-4 py-2 font-display text-xs font-semibold text-ink-primary disabled:opacity-40"
              >
                O'z narxim
              </button>
            </div>
          </div>
        ) : (
          <PaymentPanel auction={auction} isLeader={isLeader} onChanged={load} />
        )}

        <div>
          <h2 className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-ink-secondary">
            Takliflar tarixi
          </h2>
          <div className="space-y-1.5">
            {(auction.bids || []).map((bid) => (
              <div key={bid.id} className="flex items-center justify-between rounded-lg bg-base-surface px-3 py-2 text-xs">
                <span className="text-ink-secondary">
                  {bid.user?.username ? `@${bid.user.username}` : bid.user?.firstName || 'Foydalanuvchi'}
                </span>
                <span className="font-mono font-semibold text-ink-primary">{formatSom(bid.amount)}</span>
              </div>
            ))}
            {!(auction.bids || []).length && (
              <p className="text-xs text-ink-muted">Hali takliflar yo'q — birinchi bo'lib narx taklif qiling!</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

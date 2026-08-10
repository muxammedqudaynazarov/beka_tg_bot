import { useEffect, useState } from 'react';
import { api } from '../api';
import { showAlert } from '../telegram';
import { formatSom } from '../constants';
import AuctionForm from '../components/AuctionForm';

function ActiveAuctionRow({ auction, onChanged }) {
  const [minutes, setMinutes] = useState('');
  const [editing, setEditing] = useState(false);
  const hasBids = (auction._count?.bids || 0) > 0;

  async function changeTime() {
    const m = Number(minutes);
    if (!Number.isFinite(m) || m < 0) return showAlert('Неверное значение.');
    const newEndsAt = new Date(Date.now() + m * 60 * 1000).toISOString();
    try {
      await api.patch(`/admin/auctions/${auction.id}/time`, { newEndsAt });
      setMinutes('');
      onChanged();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Произошла ошибка.');
    }
  }

  async function cancel() {
    try {
      await api.post(`/admin/auctions/${auction.id}/cancel`);
      onChanged();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Произошла ошибка.');
    }
  }

  async function handleSave(payload) {
    try {
      await api.patch(`/admin/auctions/${auction.id}`, payload);
      showAlert('✅ Сохранено.');
      setEditing(false);
      onChanged();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Произошла ошибка.');
    }
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink">{auction.skinName}</p>
          <p className="mt-0.5 text-xs text-muted">
            Текущая цена: {formatSom(auction.currentPrice)} · Окончание: {new Date(auction.endsAt).toLocaleString('ru-RU')}
          </p>
        </div>
        {!hasBids && !editing && (
          <button onClick={() => setEditing(true)} className="shrink-0 rounded-md bg-surface px-2.5 py-1 text-xs font-medium text-ink border border-border">
            ✏️ Редактировать
          </button>
        )}
      </div>

      {hasBids && (
        <p className="mt-1 text-[10px] text-warning">
          На этот аукцион уже поступили ставки — основные данные изменить нельзя, только время.
        </p>
      )}

      {editing ? (
        <div className="mt-2 rounded-md border border-accent/40 bg-bg p-2.5">
          <AuctionForm
            initial={{
              skinName: auction.skinName,
              imageUrl: auction.imageUrl,
              subcategoryId: auction.subcategoryId,
              rarity: auction.rarity,
              floatValue: auction.floatValue,
              wearCondition: auction.wearCondition,
              isStatTrak: auction.isStatTrak,
              paintSeed: auction.paintSeed ?? '',
              steamAssetId: auction.steamAssetId ?? '',
              stickers: auction.stickers || [],
              startPrice: auction.startPrice,
            }}
            submitLabel="Сохранить изменения"
            onSubmit={handleSave}
          />
          <button onClick={() => setEditing(false)} className="mt-2 w-full rounded-md bg-surface py-1.5 text-xs font-medium text-muted border border-border">
            Отмена
          </button>
        </div>
      ) : (
        <>
          <div className="mt-2 flex gap-2">
            <input
              type="number"
              min="0"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="Через сколько минут завершить"
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <button onClick={changeTime} className="shrink-0 rounded-md bg-surface px-3 py-1.5 text-xs font-medium text-ink border border-border">
              Изменить время
            </button>
          </div>
          <button onClick={cancel} className="mt-2 w-full rounded-md bg-danger/10 py-1.5 text-xs font-medium text-danger">
            Отменить аукцион
          </button>
        </>
      )}
    </div>
  );
}

function DeliveryRow({ auction, onChanged }) {
  async function markDelivered() {
    try {
      await api.post(`/admin/auctions/${auction.id}/deliver`);
      onChanged();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Произошла ошибка.');
    }
  }

  return (
    <div className="rounded-lg border border-success/40 bg-success/5 p-3">
      <p className="text-sm font-medium text-ink">{auction.skinName}</p>
      <p className="mt-0.5 text-xs text-muted">
        Победитель: {auction.currentLeader?.username ? `@${auction.currentLeader.username}` : auction.currentLeader?.firstName || '—'}
      </p>
      {auction.currentLeader?.tradeUrl ? (
        <p className="mt-1 break-all rounded bg-surface px-2 py-1 font-mono text-[10px] text-ink">
          {auction.currentLeader.tradeUrl}
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-warning">Победитель ещё не указал Trade URL — попросите его.</p>
      )}
      <button onClick={markDelivered} className="mt-2 w-full rounded-md bg-success py-1.5 text-xs font-semibold text-black">
        Отметить как отправлено через Steam
      </button>
    </div>
  );
}

export default function AuctionsPage() {
  const [active, setActive] = useState(null);
  const [awaitingDelivery, setAwaitingDelivery] = useState(null);

  function load() {
    api.get('/auctions', { params: { take: 50 } }).then(({ data }) => setActive(data.items || []));
    api.get('/admin/auctions/awaiting-delivery').then(({ data }) => setAwaitingDelivery(data.items || []));
  }
  useEffect(load, []);

  // 2-band: real vaqtga yaqin yangilanish — soket infratuzilmasini butunlay
  // qayta qurmasdan, oddiy va bashorat qilinadigan yuklama beradigan usul:
  // har 10 soniyada, FAQAT sahifa ko'rinib turgan (faol tab) paytda so'raladi
  // — fon tabda ortiqcha so'rov yubormaslik uchun.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const loading = active === null || awaitingDelivery === null;
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-surface" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {awaitingDelivery.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
            Оплачено, нужно отправить ({awaitingDelivery.length})
          </h2>
          <div className="space-y-2">
            {awaitingDelivery.map((a) => <DeliveryRow key={a.id} auction={a} onChanged={load} />)}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Активные аукционы ({active.length})</h2>
        {active.length ? (
          <div className="space-y-2">
            {active.map((a) => <ActiveAuctionRow key={a.id} auction={a} onChanged={load} />)}
          </div>
        ) : (
          <p className="text-xs text-muted">Пока нет активных аукционов.</p>
        )}
      </section>
    </div>
  );
}

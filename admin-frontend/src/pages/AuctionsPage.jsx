import { useEffect, useState } from 'react';
import { api } from '../api';
import { showAlert } from '../telegram';

function formatSom(n) {
  return `${Number(n || 0).toLocaleString('uz-UZ')} so'm`;
}

function ActiveAuctionRow({ auction, onChanged }) {
  const [minutes, setMinutes] = useState('');

  async function changeTime() {
    const m = Number(minutes);
    if (!Number.isFinite(m) || m < 0) return showAlert('Noto\'g\'ri qiymat.');
    const newEndsAt = new Date(Date.now() + m * 60 * 1000).toISOString();
    try {
      await api.patch(`/admin/auctions/${auction.id}/time`, { newEndsAt });
      setMinutes('');
      onChanged();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Xatolik yuz berdi.');
    }
  }

  async function cancel() {
    try {
      await api.post(`/admin/auctions/${auction.id}/cancel`);
      onChanged();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Xatolik yuz berdi.');
    }
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-sm font-medium text-ink">{auction.skinName}</p>
      <p className="mt-0.5 text-xs text-muted">
        Joriy narx: {formatSom(auction.currentPrice)} · Tugaydi: {new Date(auction.endsAt).toLocaleString('uz-UZ')}
      </p>
      <div className="mt-2 flex gap-2">
        <input
          type="number"
          min="0"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          placeholder="Necha daqiqadan keyin tugasin"
          className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <button onClick={changeTime} className="rounded-md bg-surface px-3 py-1.5 text-xs font-medium text-ink border border-border">
          Vaqtni o'zgartirish
        </button>
      </div>
      <button onClick={cancel} className="mt-2 w-full rounded-md bg-danger/10 py-1.5 text-xs font-medium text-danger">
        Bekor qilish
      </button>
    </div>
  );
}

function DeliveryRow({ auction, onChanged }) {
  async function markDelivered() {
    try {
      await api.post(`/admin/auctions/${auction.id}/deliver`);
      onChanged();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Xatolik yuz berdi.');
    }
  }

  return (
    <div className="rounded-lg border border-success/40 bg-success/5 p-3">
      <p className="text-sm font-medium text-ink">{auction.skinName}</p>
      <p className="mt-0.5 text-xs text-muted">
        G'olib: {auction.currentLeader?.username ? `@${auction.currentLeader.username}` : auction.currentLeader?.firstName || '—'}
      </p>
      {auction.currentLeader?.tradeUrl ? (
        <p className="mt-1 break-all rounded bg-surface px-2 py-1 font-mono text-[10px] text-ink">
          {auction.currentLeader.tradeUrl}
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-warning">G'olib hali Trade URL kiritmagan — undan so'rang.</p>
      )}
      <button onClick={markDelivered} className="mt-2 w-full rounded-md bg-success py-1.5 text-xs font-semibold text-black">
        Steam orqali yuborildi deb belgilash
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
            To'langan, yuborish kerak ({awaitingDelivery.length})
          </h2>
          <div className="space-y-2">
            {awaitingDelivery.map((a) => <DeliveryRow key={a.id} auction={a} onChanged={load} />)}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Faol auksionlar ({active.length})</h2>
        {active.length ? (
          <div className="space-y-2">
            {active.map((a) => <ActiveAuctionRow key={a.id} auction={a} onChanged={load} />)}
          </div>
        ) : (
          <p className="text-xs text-muted">Hozircha faol auksionlar yo'q.</p>
        )}
      </section>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../api';
import { openLink } from '../telegram';

// 10/11-band: ilova ochilganda (har 3-ochilishda bir marta — backend
// hisoblab, useAuth orqali "showPopupAd" bayrog'ini beradi) chiqadigan
// to'liq ekranli reklama banneri.
export default function AdPopup({ shouldShow }) {
  const [ad, setAd] = useState(null);
  const [visible, setVisible] = useState(false);
  const [impressionSent, setImpressionSent] = useState(false);

  useEffect(() => {
    if (!shouldShow) return;
    api.get('/ads/popup').then(({ data }) => {
      if (data.ad) {
        setAd(data.ad);
        setVisible(true);
      }
    });
  }, [shouldShow]);

  useEffect(() => {
    if (ad && visible && !impressionSent) {
      api.post(`/ads/${ad.id}/impression`).catch(() => {});
      setImpressionSent(true);
    }
  }, [ad, visible, impressionSent]);

  if (!visible || !ad) return null;

  async function handleClick() {
    api.post(`/ads/${ad.id}/click`).catch(() => {});
    if (ad.linkUrl) openLink(ad.linkUrl);
    setVisible(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6" onClick={() => setVisible(false)}>
      <div className="relative w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setVisible(false)}
          className="absolute -top-9 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-base-surface text-ink-primary"
        >
          <X size={16} />
        </button>
        <button onClick={handleClick} className="block w-full overflow-hidden rounded-2xl shadow-glow">
          <img src={ad.imageUrl} alt="Реклама" className="w-full object-cover" />
        </button>
      </div>
    </div>
  );
}

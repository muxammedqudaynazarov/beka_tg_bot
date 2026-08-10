import { useEffect, useState } from 'react';
import { api } from '../api';
import { openLink } from '../telegram';

// 10/11-band: har bir sahifa header'i ostida doimiy ko'rinadigan tor banner.
// Faol reklama bo'lmasa, hech narsa render qilinmaydi (joy egallamaydi).
export default function AdBanner() {
  const [ad, setAd] = useState(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    api.get('/ads/banner').then(({ data }) => setAd(data.ad));
  }, []);

  useEffect(() => {
    if (ad && !shown) {
      api.post(`/ads/${ad.id}/impression`).catch(() => {});
      setShown(true);
    }
  }, [ad, shown]);

  if (!ad) return null;

  async function handleClick() {
    api.post(`/ads/${ad.id}/click`).catch(() => {});
    if (ad.linkUrl) openLink(ad.linkUrl);
  }

  return (
    <button onClick={handleClick} className="block w-full border-b border-base-border">
      <img src={ad.imageUrl} alt="Реклама" className="h-14 w-full object-cover" />
    </button>
  );
}

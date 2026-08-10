import { useEffect, useState } from 'react';
import { Image as ImageIcon, Eye, MousePointerClick, Save, Trash2 } from 'lucide-react';
import { api } from '../api';
import { showAlert, showConfirm } from '../telegram';

const SLOT_INFO = {
  BANNER: {
    title: 'Реклама 1 — баннер',
    desc: 'Показывается постоянно под заголовком каждой страницы (небольшая полоска).',
  },
  POPUP: {
    title: 'Реклама 2 — всплывающее окно',
    desc: 'Показывается при открытии приложения, но не каждый раз — раз в 3 открытия (чтобы не надоедать).',
  },
};

function AdSlotCard({ slot, ad, onSaved }) {
  const [imageUrl, setImageUrl] = useState(ad?.imageUrl || '');
  const [linkUrl, setLinkUrl] = useState(ad?.linkUrl || '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!imageUrl.trim()) return showAlert('Укажите URL изображения.');
    setSaving(true);
    try {
      await api.put(`/admin/ads/${slot}`, { imageUrl: imageUrl.trim(), linkUrl: linkUrl.trim() || undefined, isActive: true });
      showAlert('✅ Сохранено.');
      onSaved();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Произошла ошибка.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const ok = await showConfirm('Удалить эту рекламу?');
    if (!ok) return;
    try {
      await api.delete(`/admin/ads/${slot}`);
      setImageUrl('');
      setLinkUrl('');
      showAlert('🗑 Удалено.');
      onSaved();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Произошла ошибка.');
    }
  }

  const ctr = ad && ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(1) : null;

  return (
    <div className="rounded-lg border border-border p-3">
      <h3 className="text-sm font-semibold text-ink">{SLOT_INFO[slot].title}</h3>
      <p className="mt-0.5 text-[11px] text-muted">{SLOT_INFO[slot].desc}</p>

      <div className="mt-3 space-y-2">
        <input
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="URL изображения *"
          className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <input
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="URL при нажатии (необязательно)"
          className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
        />
        {imageUrl && (
          <img src={imageUrl} alt="" className="h-16 rounded-md border border-border bg-surface object-contain p-1" onError={(e) => (e.target.style.display = 'none')} />
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <button onClick={save} disabled={saving} className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          <Save size={13} /> {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
        {ad && (
          <button onClick={remove} className="flex items-center justify-center gap-1.5 rounded-md border border-danger/40 px-3 py-1.5 text-xs text-danger">
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {ad && (
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-[10px] text-muted"><Eye size={11} /> Показы</div>
            <p className="font-mono text-sm font-bold text-ink">{ad.impressions}</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-[10px] text-muted"><MousePointerClick size={11} /> Клики</div>
            <p className="font-mono text-sm font-bold text-ink">{ad.clicks}</p>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-muted">CTR</div>
            <p className="font-mono text-sm font-bold text-accent">{ctr !== null ? `${ctr}%` : '—'}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdsPage() {
  const [ads, setAds] = useState(null);

  function load() {
    api.get('/admin/ads').then(({ data }) => setAds(data));
  }
  useEffect(load, []);

  if (ads === null) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => <div key={i} className="h-40 animate-pulse rounded-lg bg-surface" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/5 p-3 text-[11px] text-muted">
        <ImageIcon size={14} className="mt-0.5 shrink-0 text-accent" />
        Изображения будут показаны в пользовательском Mini App. Рекомендуемый формат — широкий баннер (например 800×200).
      </div>
      <AdSlotCard slot="BANNER" ad={ads.BANNER} onSaved={load} />
      <AdSlotCard slot="POPUP" ad={ads.POPUP} onSaved={load} />
    </div>
  );
}

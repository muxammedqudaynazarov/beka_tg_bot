import { useEffect, useRef, useState } from 'react';
import { Upload, Copy, Trash2, ImageIcon, Loader2 } from 'lucide-react';
import { api } from '../api';
import { showAlert, showConfirm } from '../telegram';

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function MediaRow({ item, onDeleted }) {
  const [deleting, setDeleting] = useState(false);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(item.url);
      showAlert('📋 Ссылка скопирована.');
    } catch {
      showAlert(item.url);
    }
  }

  async function remove() {
    const ok = await showConfirm('Удалить это изображение? Ссылка перестанет работать.');
    if (!ok) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/media/${item.id}`);
      onDeleted();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Произошла ошибка.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-2.5">
      <img src={item.url} alt="" className="h-14 w-14 shrink-0 rounded-md bg-surface object-cover" />
      <div className="min-w-0 flex-1">
        <button onClick={copyUrl} className="flex w-full items-center gap-1 truncate text-left font-mono text-[11px] text-accent">
          <Copy size={11} className="shrink-0" /> <span className="truncate">{item.url}</span>
        </button>
        <p className="mt-0.5 text-[10px] text-muted">
          {item.width}×{item.height} · {formatSize(item.sizeBytes)}
        </p>
      </div>
      <button onClick={remove} disabled={deleting} className="shrink-0 text-muted hover:text-danger disabled:opacity-50">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export default function MediaPage() {
  const [items, setItems] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  function load() {
    api.get('/admin/media').then(({ data }) => setItems(data.items || []));
  }
  useEffect(load, []);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const { data } = await api.post('/admin/media/upload', formData);
      showAlert('✅ Изображение загружено и оптимизировано.');
      load();
      // Yangi yuklangan rasmning URL'ini darhol clipboard'ga ham nusxalab qo'yamiz — qulaylik uchun
      try {
        await navigator.clipboard.writeText(data.url);
      } catch {
        /* clipboard mavjud bo'lmasa jim o'tkazamiz */
      }
    } catch (err) {
      showAlert(err.response?.data?.error || 'Не удалось загрузить изображение.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/5 p-3 text-[11px] text-muted">
        <ImageIcon size={14} className="mt-0.5 shrink-0 text-accent" />
        Изображения автоматически оптимизируются: ширина не более 1500px (высота — пропорционально), качество 60%.
        Используйте полученную ссылку в любом поле "URL изображения" в приложении.
      </div>

      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-8 text-center hover:border-accent">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" disabled={uploading} />
        {uploading ? (
          <>
            <Loader2 size={22} className="animate-spin text-accent" />
            <span className="text-xs text-muted">Загрузка и оптимизация…</span>
          </>
        ) : (
          <>
            <Upload size={22} className="text-accent" />
            <span className="text-xs font-medium text-ink">Нажмите, чтобы выбрать изображение</span>
          </>
        )}
      </label>

      {items === null ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-surface" />)}</div>
      ) : items.length ? (
        <div className="space-y-2">
          {items.map((m) => <MediaRow key={m.id} item={m} onDeleted={load} />)}
        </div>
      ) : (
        <p className="text-xs text-muted">Изображений пока нет.</p>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Send, Image as ImageIcon } from 'lucide-react';
import { api } from '../api';
import { showAlert } from '../telegram';

export default function BroadcastPage() {
  const [message, setMessage] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState(null);

  function load() {
    api.get('/admin/broadcasts').then(({ data }) => setHistory(data.items || []));
  }
  useEffect(load, []);

  async function send() {
    if (!message.trim()) return showAlert('Введите текст сообщения.');
    setSending(true);
    try {
      await api.post('/admin/broadcasts', { message: message.trim(), imageUrl: imageUrl.trim() || undefined });
      showAlert('✅ Рассылка запущена — отправка идёт в фоновом режиме.');
      setMessage('');
      setImageUrl('');
      setTimeout(load, 1500);
    } catch (err) {
      showAlert(err.response?.data?.error || 'Произошла ошибка.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Новая рассылка</h2>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          placeholder="Текст сообщения для всех пользователей…"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
          <ImageIcon size={14} className="shrink-0 text-muted" />
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="URL изображения (необязательно)"
            className="w-full bg-transparent text-xs text-ink placeholder:text-muted focus:outline-none"
          />
        </div>
        {imageUrl && (
          <img src={imageUrl} alt="" className="h-24 w-24 rounded-lg border border-border bg-surface object-contain p-1" onError={(e) => (e.target.style.display = 'none')} />
        )}
        <button
          onClick={send}
          disabled={sending}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Send size={14} /> {sending ? 'Запуск…' : 'Отправить всем'}
        </button>
        <p className="text-[10px] text-muted">
          Сообщение будет отправлено всем незаблокированным пользователям через бота. Поддерживается разметка: *жирный* или **жирный**, _курсив_ или __курсив__, `код`, [текст](ссылка) — оба варианта написания работают.
          Если указано изображение — с картинкой, иначе текстом. Отправка занимает время (~25 сообщений в секунду).
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Последние 5 рассылок</h2>
        {history === null ? (
          <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-surface" />)}</div>
        ) : history.length ? (
          <div className="space-y-2">
            {history.map((b) => (
              <div key={b.id} className="rounded-lg border border-border p-3">
                <p className="text-xs text-ink line-clamp-2">{b.message}</p>
                <p className="mt-1 text-[10px] text-muted">
                  {new Date(b.createdAt).toLocaleString('ru-RU')} · {b.admin?.firstName || b.admin?.username} ·{' '}
                  {b.sentCount + b.failedCount > 0
                    ? `✅ ${b.sentCount} · ❌ ${b.failedCount}`
                    : 'отправляется…'}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted">Рассылок ещё не было.</p>
        )}
      </section>
    </div>
  );
}

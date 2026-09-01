import { useEffect, useRef, useState } from 'react';
import { Send, Image as ImageIcon, Trash2 } from 'lucide-react';
import { api } from '../api';
import { formatDate } from '../constants';
import { showAlert, showConfirm } from '../telegram';
import TelegramRichTextEditor from '../components/TelegramRichTextEditor';

export default function BroadcastPage() {
  const editorRef = useRef(null);
  const [imageUrl, setImageUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState(null);

  function load() {
    api.get('/admin/broadcasts').then(({ data }) => setHistory(data.items || []));
  }

  async function remove(id) {
    const ok = await showConfirm('Удалить эту рассылку из истории?');
    if (!ok) return;
    try {
      await api.delete(`/admin/broadcasts/${id}`);
      load();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Произошла ошибка.');
    }
  }
  useEffect(load, []);

  async function send() {
    if (editorRef.current.isEmpty()) return showAlert('Введите текст сообщения.');
    setSending(true);
    try {
      const html = editorRef.current.getHtml();
      await api.post('/admin/broadcasts', { message: html, imageUrl: imageUrl.trim() || undefined });
      showAlert('✅ Рассылка запущена — отправка идёт в фоновом режиме.');
      editorRef.current.clear();
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

        {/* 1-band: endi Markdown emas — boy matn muharriri, HTML rejimida
            yuboriladi. Bu "_" kabi belgilar oddiy matnda (masalan
            @username_bot) TASODIFAN formatlash sifatida talqin qilinishining
            OLDINI TO'LIQ oladi — Markdown'da bu tuzatib bo'lmaydigan muammo edi. */}
        <TelegramRichTextEditor ref={editorRef} placeholder="Текст сообщения для всех пользователей…" />

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
          Выделите текст и нажмите кнопку на панели, чтобы отформатировать. Никакой ручной разметки не нужно —
          символы вроде "_" в обычном тексте (например, в @username) теперь никогда не ломают форматирование.
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
              <div key={b.id} className="flex items-start justify-between gap-2 rounded-lg border border-border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-ink line-clamp-2">{b.message.replace(/<[^>]+>/g, '')}</p>
                  <p className="mt-1 text-[10px] text-muted">
                    {formatDate(b.createdAt)} · {b.admin?.firstName || b.admin?.username} ·{' '}
                    {b.sentCount + b.failedCount > 0
                      ? `✅ ${b.sentCount} · ❌ ${b.failedCount}`
                      : 'отправляется…'}
                  </p>
                </div>
                <button
                  onClick={() => remove(b.id)}
                  className="shrink-0 text-muted hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
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

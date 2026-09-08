import { useEffect, useState } from 'react';
import { ChevronLeft, Plus, Trophy, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { showAlert, showConfirm, hapticNotification } from '../telegram';

const FORMAT_MAX = { BO1: 1, BO3: 2, BO5: 3 };
const STATUS_LABELS = { ACTIVE: 'Активен', CLOSED: 'Закрыт', COMPLETED: 'Завершён', CANCELLED: 'Отменён' };
const STATUS_COLORS = {
  ACTIVE: 'text-signal-success bg-signal-success/10',
  CLOSED: 'text-signal-warning bg-signal-warning/10',
  COMPLETED: 'text-rarity-covert bg-rarity-covert/10',
  CANCELLED: 'text-ink-muted bg-base-surface2',
};

function genCode() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return 'PRD' + Array.from({ length: 4 }, () => a[Math.floor(Math.random() * a.length)]).join('');
}

// Har bir prediction kartasi uchun ALOHIDA lokal state.
// Sahifa darajasidagi umumiy state ulashilmaydi — bir karta
// boshqa kartaning maydonini o'zgartirmaydi.
function ResultForm({ p, onDone }) {
  const [resA, setResA] = useState('0');
  const [resB, setResB] = useState('0');
  const [saving, setSaving] = useState(false);
  const max = FORMAT_MAX[p.format];
  const opts = Array.from({ length: max + 1 }, (_, i) => i);

  async function submit() {
    const a = Number(resA), b = Number(resB);
    if (a === b) return showAlert('Ничья невозможна — счёт не может быть равным.');
    // BO3 va BO5 da g'olib tomonning maksimal yutiqqa ega bo'lishi shart.
    // BO1 da esa xaritadagi hisob (13-8 kabi) erkin bo'ladi — faqat teng emas.
    if (p.format !== 'BO1' && a !== max && b !== max) {
      return showAlert(`Один из счётов должен быть ${max} (победитель серии).`);
    }
    const ok = await showConfirm(`Завершить прогноз? Правильный счёт: ${resA}-${resB}`);
    if (!ok) return;
    setSaving(true);
    try {
      const { data } = await api.post(`/predictions/${p.id}/result`, { result: `${resA}-${resB}` });
      hapticNotification('success');
      onDone({ prediction: { ...p, status: 'COMPLETED', correctResult: `${resA}-${resB}` }, winners: data.winners || [] });
    } catch (err) {
      showAlert(err.response?.data?.error || 'Ошибка при сохранении.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="mb-1.5 text-[11px] text-ink-secondary">Введите правильный счёт:</p>
      <div className="flex items-center gap-2">
        {p.format === 'BO1' ? (
          <>
            <input type="number" inputMode="numeric" min="0" max="99"
              value={resA} onChange={e => setResA(e.target.value)} placeholder="13"
              className="h-10 w-14 rounded-lg border border-base-border bg-base-surface2 text-center font-mono text-lg font-bold focus:outline-none" />
            <span className="font-mono text-ink-muted">:</span>
            <input type="number" inputMode="numeric" min="0" max="99"
              value={resB} onChange={e => setResB(e.target.value)} placeholder="8"
              className="h-10 w-14 rounded-lg border border-base-border bg-base-surface2 text-center font-mono text-lg font-bold focus:outline-none" />
          </>
        ) : (
          <>
            <select value={resA} onChange={e => {
              const v = e.target.value; setResA(v);
              if (Number(v) === max && Number(resB) === max) setResB(String(max - 1));
            }} className="h-10 w-14 rounded-lg border border-base-border bg-base-surface2 text-center font-mono text-lg font-bold text-ink-primary focus:outline-none">
              {(Number(resB) === max
                ? Array.from({ length: max }, (_, i) => i)
                : opts
              ).map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <span className="font-mono text-ink-muted">:</span>
            <select value={resB} onChange={e => {
              const v = e.target.value; setResB(v);
              if (Number(v) === max && Number(resA) === max) setResA(String(max - 1));
            }} className="h-10 w-14 rounded-lg border border-base-border bg-base-surface2 text-center font-mono text-lg font-bold text-ink-primary focus:outline-none">
              {(Number(resA) === max
                ? Array.from({ length: max }, (_, i) => i)
                : opts
              ).map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </>
        )}
        <button onClick={submit} disabled={saving}
          className="flex-1 rounded-lg bg-rarity-covert py-2 font-display text-xs font-bold text-white disabled:opacity-50">
          {saving ? '…' : 'Завершить'}
        </button>
      </div>
    </div>
  );
}

export default function StreamerPage() {
  const navigate = useNavigate();
  const [predictions, setPredictions] = useState(null);
  const [archived, setArchived] = useState(null);
  const [showArchive, setShowArchive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', format: 'BO3', streamUrl: '', promoCode: genCode(), endsAt: '', promoAmount: '20000', teamAImage: '', teamBImage: '' });
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);

  function load() {
    api.get('/predictions').then(({ data }) => setPredictions(data.items || [])).catch(() => setPredictions([]));
  }
  useEffect(load, []);

  function loadArchive() {
    api.get('/predictions/archive').then(({ data }) => setArchived(data.items || [])).catch(() => setArchived([]));
  }

  async function create() {
    if (!form.title.trim()) return showAlert('Введите название матча.');
    if (!form.endsAt) return showAlert('Укажите время окончания приёма прогнозов.');
    setSaving(true);
    try {
      await api.post('/predictions', { ...form, promoAmount: Number(form.promoAmount) });
      hapticNotification('success');
      setCreating(false);
      setForm({ title: '', format: 'BO3', streamUrl: '', promoCode: genCode(), endsAt: '', promoAmount: '20000', teamAImage: '', teamBImage: '' });
      load();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Ошибка.');
    } finally {
      setSaving(false);
    }
  }

  async function attachPromo(predId, userId) {
    try {
      await api.post(`/predictions/${predId}/winners/${userId}/attach-promo`);
      hapticNotification('success');
      showAlert('✅ Промокод прикреплён и отправлен победителю!');
      const { data } = await api.get(`/predictions/${predId}`);
      setDetail(d => d ? { ...d, winners: data.winners || [] } : d);
    } catch (err) {
      showAlert(err.response?.data?.error || 'Ошибка.');
    }
  }

  async function deletePrediction(p) {
    const ok = await showConfirm(`Удалить прогноз «${p.title}»? Все данные будут потеряны.`);
    if (!ok) return;
    try {
      await api.delete(`/predictions/${p.id}`);
      hapticNotification('success');
      if (detail?.prediction?.id === p.id) setDetail(null);
      load();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Ошибка при удалении.');
    }
  }

  const inputCls = 'w-full rounded-xl border border-base-border bg-base-surface px-3.5 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted focus:border-rarity-covert focus:outline-none';

  return (
    <div className="min-h-screen px-4 pb-28 pt-6">
      <header className="mb-5 flex items-center gap-2">
        <button onClick={() => navigate('/profile')} className="text-ink-secondary">
          <ChevronLeft size={20} />
        </button>
        <h1 className="font-display text-base font-bold text-ink-primary">Стрим-панель</h1>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => { setShowArchive(v => { if (!v) loadArchive(); return !v; }); setCreating(false); }}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${showArchive ? 'border-rarity-covert text-rarity-covert' : 'border-base-border text-ink-secondary'}`}>
            Архив
          </button>
          {!showArchive && (
            <button onClick={() => { setCreating(true); setDetail(null); }}
              className="flex items-center gap-1.5 rounded-full bg-rarity-covert px-3.5 py-1.5 font-display text-xs font-bold text-white">
              <Plus size={13} /> Новый
            </button>
          )}
        </div>
      </header>

      {/* Создание */}
      {creating && (
        <div className="mb-5 space-y-3 rounded-xl bg-base-surface p-4">
          <h2 className="font-display text-sm font-bold text-ink-primary">Новый прогноз</h2>
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
            placeholder="Название матча (напр. NaVi vs Astralis)" className={inputCls} />
          <div className="grid grid-cols-3 gap-2">
            {['BO1', 'BO3', 'BO5'].map(f => (
              <button key={f} onClick={() => setForm({ ...form, format: f })}
                className={`rounded-lg border py-2 font-mono text-sm font-bold ${form.format === f ? 'border-rarity-covert bg-rarity-covert/10 text-rarity-covert' : 'border-base-border text-ink-secondary'}`}>
                {f}
              </button>
            ))}
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-ink-secondary">Приём прогнозов до</label>
            <input type="datetime-local" value={form.endsAt}
              onChange={e => setForm({ ...form, endsAt: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-ink-secondary">Сумма призового промо-кода (макс. 40 000 сум)</label>
            <input type="number" min="1000" max="40000" value={form.promoAmount}
              onChange={e => setForm({ ...form, promoAmount: e.target.value })}
              placeholder="20000" className={inputCls} />
            <p className="mt-1 text-[10px] text-ink-muted">Победитель получит эту сумму на баланс через промо-код</p>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-ink-secondary">Промо-код победителю</label>
            <div className="flex gap-2">
              <input value={form.promoCode}
                onChange={e => setForm({ ...form, promoCode: e.target.value.toUpperCase() })}
                className={inputCls + ' font-mono uppercase'} />
              <button onClick={() => setForm({ ...form, promoCode: genCode() })}
                className="shrink-0 rounded-xl border border-base-border px-3 text-xs text-ink-secondary">
                Новый
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-ink-secondary">Ссылка на стрим (необязательно)</label>
            <input value={form.streamUrl}
              onChange={e => setForm({ ...form, streamUrl: e.target.value })}
              placeholder="https://t.me/..." className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] text-ink-secondary">Логотип команды А (URL)</label>
              <input value={form.teamAImage}
                onChange={e => setForm({ ...form, teamAImage: e.target.value })}
                placeholder="https://..." className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-ink-secondary">Логотип команды Б (URL)</label>
              <input value={form.teamBImage}
                onChange={e => setForm({ ...form, teamBImage: e.target.value })}
                placeholder="https://..." className={inputCls} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setCreating(false)}
              className="flex-1 rounded-xl border border-base-border py-2.5 text-sm text-ink-secondary">
              Отмена
            </button>
            <button onClick={create} disabled={saving}
              className="flex-1 rounded-xl bg-rarity-covert py-2.5 font-display text-sm font-bold text-white disabled:opacity-50">
              {saving ? 'Создание…' : 'Создать'}
            </button>
          </div>
        </div>
      )}

      {/* Победители */}
      {detail && (
        <div className="mb-5 rounded-xl bg-base-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <Trophy size={16} className="text-signal-warning" />
            <h2 className="font-display text-sm font-bold text-ink-primary">Победители</h2>
            <span className="ml-auto font-mono text-base font-bold text-rarity-covert">
              {detail.prediction.correctResult}
            </span>
          </div>
          {detail.winners.length === 0 ? (
            <p className="text-xs text-ink-muted">Никто не угадал правильный счёт.</p>
          ) : (
            <div className="space-y-2">
              {detail.winners.map(w => {
                const medals = ['🥇', '🥈', '🥉'];
                const name = w.user?.username ? `@${w.user.username}` : w.user?.firstName || 'Участник';
                return (
                  <div key={w.id} className="flex items-center gap-2.5 rounded-lg bg-base-surface2 px-3 py-2">
                    <span>{medals[w.position - 1]}</span>
                    <span className="flex-1 text-sm font-semibold text-ink-primary">{name}</span>
                    {w.promoCodeId ? (
                      <span className="rounded bg-signal-success/15 px-2 py-0.5 text-[10px] font-semibold text-signal-success">
                        Отправлен
                      </span>
                    ) : (
                      <button onClick={() => attachPromo(detail.prediction.id, w.user.id)}
                        className="rounded bg-rarity-covert px-2 py-0.5 text-[10px] font-bold text-white">
                        Прикрепить
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <button onClick={() => setDetail(null)}
            className="mt-3 w-full rounded-lg border border-base-border py-2 text-xs text-ink-secondary">
            Закрыть
          </button>
        </div>
      )}

      {/* Архив */}
      {showArchive ? (
        archived === null ? (
          <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-14 animate-pulse rounded-xl bg-base-surface"/>)}</div>
        ) : archived.length === 0 ? (
          <p className="text-center text-xs text-ink-muted">Архив пуст.</p>
        ) : (
          <div className="space-y-2">
            {archived.map(p => (
              <div key={p.id} className="rounded-xl bg-base-surface px-4 py-3 opacity-80">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-display text-sm font-semibold text-ink-primary">{p.title}</p>
                    <p className="text-[10px] text-ink-muted">{p.format} · {p._count?.entries ?? 0} участников</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`rounded px-2 py-0.5 text-[9px] font-bold ${STATUS_COLORS[p.status]}`}>
                      {STATUS_LABELS[p.status]}
                    </span>
                    {p.correctResult && (
                      <span className="font-mono text-[11px] font-bold text-rarity-covert">{p.correctResult}</span>
                    )}
                  </div>
                </div>
                {p.status === 'COMPLETED' && (
                  <button onClick={async () => {
                    const { data } = await api.get(`/predictions/${p.id}`);
                    setDetail({ prediction: data.prediction, winners: data.winners || [] });
                    setShowArchive(false);
                  }} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-rarity-covert/30 py-1.5 text-[11px] text-rarity-covert">
                    <Trophy size={12} /> Победители
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      ) : (

      /* Список прогнозов */
      <>
      {predictions === null ? (
        <div className="space-y-2">
          {[0, 1].map(i => <div key={i} className="h-16 animate-pulse rounded-xl bg-base-surface" />)}
        </div>
      ) : predictions.length === 0 ? (
        <p className="text-center text-xs text-ink-muted">Прогнозов пока нет. Создайте первый!</p>
      ) : (
        <div className="space-y-3">
          {predictions.map(p => {
            const isActive = p.status === 'ACTIVE';
            const canFinish = isActive || p.status === 'CLOSED';
            return (
              <div key={p.id} className="rounded-xl bg-base-surface px-4 py-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-display text-sm font-bold text-ink-primary">{p.title}</p>
                    <p className="text-[10px] text-ink-muted">{p.format} · {p._count?.entries ?? 0} участников</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className={`rounded px-2 py-0.5 text-[9px] font-bold ${STATUS_COLORS[p.status]}`}>
                      {STATUS_LABELS[p.status]}
                    </span>
                    {p.status !== 'COMPLETED' && (
                      <button onClick={() => deletePrediction(p)} className="text-ink-muted hover:text-signal-danger">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
                <p className="mb-3 font-mono text-[10px] text-ink-secondary">
                  Промо: <span className="font-bold text-ink-primary">{p.promoCode}</span>
                  {p.promoAmount ? <span className="ml-2 text-ink-muted">· {Number(p.promoAmount).toLocaleString('ru-RU')} сум</span> : null}
                </p>

                {canFinish && (
                  <ResultForm p={p} onDone={d => { setDetail(d); load(); }} />
                )}

                {p.status === 'COMPLETED' && (
                  <button onClick={async () => {
                    const { data } = await api.get(`/predictions/${p.id}`);
                    setDetail({ prediction: data.prediction, winners: data.winners || [] });
                  }} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-rarity-covert/40 py-2 text-xs font-semibold text-rarity-covert">
                    <Trophy size={13} /> Победители и промокоды
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      </>
      )}
    </div>
  );
}

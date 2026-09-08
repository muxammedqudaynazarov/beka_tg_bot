import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ExternalLink, Users, Clock } from 'lucide-react';
import { api } from '../api';
import { showAlert, hapticNotification, openLink } from '../telegram';
import teamAPlaceholder from '../assets/team-a-placeholder.png';
import teamBPlaceholder from '../assets/team-b-placeholder.png';

const FORMAT_MAX = { BO1: 1, BO3: 2, BO5: 3 };

export default function PredictionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [prediction, setPrediction] = useState(null);
  const [myEntry, setMyEntry] = useState(null);
  const [winners, setWinners] = useState([]);
  const [scoreA, setScoreA] = useState('0');
  const [scoreB, setScoreB] = useState('0');
  const [submitting, setSubmitting] = useState(false);

  function load() {
    api.get(`/predictions/${id}`).then(({ data }) => {
      setPrediction(data.prediction);
      setMyEntry(data.myEntry);
      setWinners(data.winners || []);
    }).catch(() => navigate('/'));
  }
  useEffect(load, [id]);

  async function submit() {
    const max = FORMAT_MAX[prediction?.format];
    const a = Number(scoreA), b = Number(scoreB);
    if (a === b) return showAlert('Ничья невозможна — счёт не может быть равным.');
    if (prediction?.format !== 'BO1' && a !== max && b !== max) {
      return showAlert(`Один из счётов должен быть ${max} (победитель серии).`);
    }
    setSubmitting(true);
    try {
      await api.post(`/predictions/${id}/entries`, { guess: `${scoreA}-${scoreB}` });
      hapticNotification('success');
      load();
    } catch (err) {
      hapticNotification('error');
      showAlert(err.response?.data?.error || 'Ошибка при отправке.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!prediction) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-rarity-covert border-t-transparent" />
      </div>
    );
  }

  const p = prediction;
  const isActive = p.status === 'ACTIVE' && new Date(p.endsAt) > Date.now();
  const isCompleted = p.status === 'COMPLETED';
  const streamer = p.createdBy?.username ? `@${p.createdBy.username}` : p.createdBy?.firstName || 'Стример';
  const max = FORMAT_MAX[p.format];
  const options = Array.from({ length: max + 1 }, (_, i) => i);

  return (
    <div className="min-h-screen px-4 pb-28 pt-6">
      <header className="mb-5 flex items-center gap-2">
        <button onClick={() => navigate('/')} className="text-ink-secondary">
          <ChevronLeft size={20} />
        </button>
        <h1 className="font-display text-base font-bold text-ink-primary">Прогноз точного счёта</h1>
      </header>

      {/* Streamer info */}
      <div className="mb-4 flex items-center gap-2.5 rounded-xl bg-base-surface px-3.5 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rarity-covert/20 font-display text-sm font-bold text-rarity-covert">
          {streamer[0]?.toUpperCase() || 'S'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-ink-secondary">Стример</p>
          <p className="truncate font-display text-sm font-semibold text-ink-primary">{streamer}</p>
        </div>
        {p.streamUrl && (
          <button onClick={() => openLink(p.streamUrl)} className="text-ink-muted">
            <ExternalLink size={16} />
          </button>
        )}
      </div>

      {/* Match info */}
      <div className="mb-4 rounded-xl bg-base-surface px-3.5 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className={`rounded px-2 py-0.5 font-display text-[10px] font-bold ${isActive ? 'bg-signal-success/15 text-signal-success' : isCompleted ? 'bg-rarity-covert/15 text-rarity-covert' : 'bg-signal-warning/15 text-signal-warning'}`}>
            {isActive ? 'ИДЁТ ПРИЁМ' : isCompleted ? 'ЗАВЕРШЁН' : 'ЗАКРЫТ'}
          </span>
          <span className="rounded bg-base-surface2 px-2 py-0.5 font-mono text-[10px] text-ink-secondary">{p.format}</span>
        </div>
        <p className="mb-1.5 font-display text-base font-bold text-ink-primary">{p.title}</p>
        <div className="flex items-center gap-4 text-[10px] text-ink-secondary">
          <span className="flex items-center gap-1"><Users size={11} /> {p._count?.entries ?? 0} участников</span>
          <span className="flex items-center gap-1"><Clock size={11} /> до {new Date(p.endsAt).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</span>
        </div>
        {isCompleted && p.correctResult && (
          <div className="mt-2.5 flex items-center justify-center rounded-lg bg-rarity-covert/10 py-2">
            <span className="font-mono text-xl font-bold text-rarity-covert">{p.correctResult}</span>
            <span className="ml-2 text-[10px] text-ink-muted">правильный счёт</span>
          </div>
        )}
      </div>

      {/* Winners */}
      {isCompleted && winners.length > 0 && (
        <div className="mb-4 rounded-xl bg-base-surface px-3.5 py-3">
          <h2 className="mb-2.5 font-display text-xs font-bold uppercase tracking-wide text-ink-secondary">Победители</h2>
          <div className="space-y-2">
            {winners.map((w) => {
              const medals = ['🥇', '🥈', '🥉'];
              const name = w.user?.username ? `@${w.user.username}` : w.user?.firstName || 'Участник';
              return (
                <div key={w.id} className="flex items-center gap-2.5 rounded-lg bg-base-surface2 px-3 py-2">
                  <span className="text-base">{medals[w.position - 1]}</span>
                  <span className="flex-1 font-display text-sm font-semibold text-ink-primary">{name}</span>
                  {w.promoCodeId ? (
                    <span className="rounded bg-signal-success/15 px-2 py-0.5 text-[10px] font-semibold text-signal-success">Промокод выдан</span>
                  ) : (
                    <span className="text-[10px] text-ink-muted">Ожидает промокод</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* My entry */}
      {myEntry && (
        <div className="mb-4 rounded-xl border border-signal-success/40 bg-signal-success/10 px-3.5 py-3">
          <p className="text-xs font-semibold text-signal-success">Ваш прогноз отправлен</p>
          <p className="mt-0.5 font-mono text-lg font-bold text-ink-primary">{myEntry.guess}</p>
          {myEntry.isCorrect === true && <p className="mt-1 text-[11px] text-signal-success">🎉 Ваш прогноз верный!</p>}
          {myEntry.isCorrect === false && <p className="mt-1 text-[11px] text-ink-muted">К сожалению, прогноз не совпал.</p>}
        </div>
      )}

      {/* Entry form */}
      {isActive && !myEntry && (
        <div className="rounded-xl bg-base-surface px-3.5 py-4">
          <h2 className="mb-4 font-display text-sm font-bold text-ink-primary">Ваш прогноз ({p.format})</h2>

          {/* Labels */}
          <div className="mb-1.5 flex items-center px-1">
            <span className="w-[72px] text-center text-[10px] text-ink-muted">Команда А</span>
            <div className="flex-1" />
            <span className="w-[72px] text-center text-[10px] text-ink-muted">Команда Б</span>
          </div>

          {/* Logo | Score : Score | Logo — bitta qatorda */}
          <div className="mb-5 flex items-center justify-between gap-2">

            {/* Logo A */}
            <img
              src={p.teamAImage || teamAPlaceholder}
              alt="А"
              onError={e => { e.target.src = teamAPlaceholder; }}
              className="h-12 w-12 shrink-0 object-contain"
            />

            {/* Score A */}
            {p.format === 'BO1' ? (
              <input type="number" inputMode="numeric" min="0" max="99"
                value={scoreA} onChange={e => setScoreA(e.target.value)} placeholder="0"
                className="h-14 w-14 shrink-0 rounded-xl border border-base-border bg-base-surface2 text-center font-mono text-2xl font-bold text-ink-primary focus:border-rarity-covert focus:outline-none" />
            ) : (
              <select value={scoreA} onChange={e => {
                const v = e.target.value; setScoreA(v);
                if (Number(v) === max && Number(scoreB) === max) setScoreB(String(max - 1));
              }} className="h-14 w-14 shrink-0 rounded-xl border border-base-border bg-base-surface2 text-center font-mono text-2xl font-bold text-ink-primary focus:outline-none">
                {(Number(scoreB) === max ? Array.from({ length: max }, (_, i) => i) : options).map(v =>
                  <option key={v} value={v}>{v}</option>)}
              </select>
            )}

            {/* Markaz ajratuvchi */}
            <div className="flex shrink-0 flex-col items-center gap-0.5">
              <span className="font-mono text-2xl font-bold leading-none text-ink-muted">:</span>
              <span className="rounded bg-base-surface2 px-1.5 py-0.5 font-mono text-[9px] font-bold text-ink-muted">{p.format}</span>
            </div>

            {/* Score B */}
            {p.format === 'BO1' ? (
              <input type="number" inputMode="numeric" min="0" max="99"
                value={scoreB} onChange={e => setScoreB(e.target.value)} placeholder="0"
                className="h-14 w-14 shrink-0 rounded-xl border border-base-border bg-base-surface2 text-center font-mono text-2xl font-bold text-ink-primary focus:border-rarity-covert focus:outline-none" />
            ) : (
              <select value={scoreB} onChange={e => {
                const v = e.target.value; setScoreB(v);
                if (Number(v) === max && Number(scoreA) === max) setScoreA(String(max - 1));
              }} className="h-14 w-14 shrink-0 rounded-xl border border-base-border bg-base-surface2 text-center font-mono text-2xl font-bold text-ink-primary focus:outline-none">
                {(Number(scoreA) === max ? Array.from({ length: max }, (_, i) => i) : options).map(v =>
                  <option key={v} value={v}>{v}</option>)}
              </select>
            )}

            {/* Logo B */}
            <img
              src={p.teamBImage || teamBPlaceholder}
              alt="Б"
              onError={e => { e.target.src = teamBPlaceholder; }}
              className="h-12 w-12 shrink-0 object-contain"
            />

          </div>
          <button onClick={submit} disabled={submitting}
            className="w-full rounded-xl bg-rarity-covert py-3 font-display text-sm font-bold text-white disabled:opacity-50">
            {submitting ? 'Отправка…' : 'Отправить прогноз'}
          </button>
          <p className="mt-2 text-center text-[10px] text-ink-muted">Один прогноз на одного участника. Изменить нельзя.</p>
        </div>
      )}
    </div>
  );
}

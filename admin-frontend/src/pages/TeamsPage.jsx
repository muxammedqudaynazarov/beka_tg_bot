import { useEffect, useState } from 'react';
import { Trash2, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { showConfirm, showAlert } from '../telegram';
import { formatDate } from '../constants';

export default function TeamsPage() {
  const [teams, setTeams] = useState(null);
  const [search, setSearch] = useState('');

  function load() {
    setTeams(null);
    api.get('/teams').then(({ data }) => setTeams(data.items || [])).catch(() => setTeams([]));
  }
  useEffect(load, []);

  async function remove(team) {
    const ok = await showConfirm(`Удалить «${team.name}» из реестра команд?`);
    if (!ok) return;
    try {
      await api.delete(`/teams/${team.id}`);
      load();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Ошибка.');
    }
  }

  const filtered = (teams || []).filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink">Реестр команд</h2>
          <p className="text-[11px] text-muted">Автоматически пополняется при создании прогнозов</p>
        </div>
        <button onClick={load} className="text-muted hover:text-ink">
          <RefreshCw size={16} />
        </button>
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Поиск по названию..."
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
      />

      {teams === null ? (
        <div className="space-y-2">
          {[0,1,2].map(i => <div key={i} className="h-12 animate-pulse rounded-lg bg-surface" />)}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-xs text-muted py-8">
          {search ? 'Ничего не найдено.' : 'Реестр пуст — добавится при первом прогнозе.'}
        </p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(t => (
            <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2">
              {t.imageUrl ? (
                <img src={t.imageUrl} alt={t.name} className="h-8 w-8 shrink-0 object-contain"
                  onError={e => { e.target.style.display = 'none'; }} />
              ) : (
                <div className="h-8 w-8 shrink-0 rounded bg-surface2 flex items-center justify-center text-[10px] text-muted font-bold">
                  {t.name[0]?.toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink">{t.name}</p>
                {t.imageUrl && (
                  <p className="truncate text-[10px] text-muted">{t.imageUrl}</p>
                )}
              </div>
              <button onClick={() => remove(t)} className="shrink-0 text-muted hover:text-danger">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <p className="text-right text-[10px] text-muted">Итого: {filtered.length}</p>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Save, Info } from 'lucide-react';
import { api } from '../api';
import { showAlert } from '../telegram';

function formatSom(n) {
  return `${Number(n || 0).toLocaleString('ru-RU')} сум`;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [budget, setBudget] = useState('');
  const [rate, setRate] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    api.get('/admin/settings').then(({ data }) => {
      setSettings(data);
      setBudget(String(data.maxBuybackBudget));
      setRate(String(data.usdToSomRate));
    });
  }
  useEffect(load, []);

  async function save() {
    setSaving(true);
    try {
      await api.patch('/admin/settings', { maxBuybackBudget: Number(budget), usdToSomRate: Number(rate) });
      showAlert('✅ Настройки сохранены.');
      load();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Произошла ошибка.');
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <div className="h-32 animate-pulse rounded-lg bg-surface" />;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/5 p-3 text-[11px] text-muted">
        <Info size={14} className="mt-0.5 shrink-0 text-accent" />
        Эти настройки предназначены для будущей функции «продажа скинов пользователями» —
        система будет выкупать скины по цене Steam Market минус скидка, но не больше
        указанного бюджета.
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">Максимальный бюджет на выкуп (сум)</span>
        <input
          type="number"
          min="0"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">Курс USD → сум</span>
        <input
          type="number"
          min="0"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
        />
      </label>

      <div className="rounded-lg bg-surface p-3 text-xs text-ink">
        Использовано: {formatSom(settings.usedBuybackBudget)} из {formatSom(settings.maxBuybackBudget)}
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        <Save size={14} /> {saving ? 'Сохранение…' : 'Сохранить'}
      </button>
    </div>
  );
}

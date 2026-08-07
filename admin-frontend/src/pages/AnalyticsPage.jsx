import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Wallet, ArrowDownCircle, ArrowUpCircle, AlertCircle } from 'lucide-react';
import { api } from '../api';

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

function formatSom(n) {
  return `${Number(n || 0).toLocaleString('ru-RU')} сум`;
}

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted">
        <Icon size={12} className={tone} /> {label}
      </div>
      <p className={`font-mono text-base font-bold ${tone || 'text-ink'}`}>{value}</p>
    </div>
  );
}

export default function AnalyticsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);

  function load(y, m) {
    setData(null);
    api.get('/admin/analytics', { params: { year: y, month: m } }).then(({ data }) => setData(data));
  }
  useEffect(() => load(year, month), [year, month]);

  function goPrev() {
    if (!data?.canGoBack) return;
    const d = new Date(Date.UTC(year, month - 2, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth() + 1);
  }
  function goNext() {
    if (!data?.canGoForward) return;
    const d = new Date(Date.UTC(year, month, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth() + 1);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={goPrev}
          disabled={!data || !data.canGoBack}
          className="rounded-md border border-border bg-surface p-1.5 text-ink disabled:opacity-30"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="w-40 text-center text-sm font-bold text-ink">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <button
          onClick={goNext}
          disabled={!data || !data.canGoForward}
          className="rounded-md border border-border bg-surface p-1.5 text-ink disabled:opacity-30"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {!data ? (
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-surface" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={ArrowDownCircle} label="Пополнено за месяц" value={formatSom(data.totalDeposited)} tone="text-success" />
            <StatCard icon={ArrowUpCircle} label="Потрачено за месяц" value={formatSom(data.totalSpent)} tone="text-danger" />
            <StatCard
              icon={data.percentChangeVsPrevMonth >= 0 ? TrendingUp : TrendingDown}
              label="Изменение к пред. месяцу"
              value={`${data.percentChangeVsPrevMonth >= 0 ? '+' : ''}${data.percentChangeVsPrevMonth}%`}
              tone={data.percentChangeVsPrevMonth >= 0 ? 'text-success' : 'text-danger'}
            />
            <StatCard icon={AlertCircle} label="Неуспешных платежей" value={data.unsuccessfulPaymentsCount} tone="text-warning" />
          </div>

          <div className="rounded-lg border border-accent/30 bg-accent/5 p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted">
              <Wallet size={12} /> Текущий баланс всех пользователей (сейчас)
            </div>
            <p className="mt-1 font-mono text-lg font-bold text-ink">{formatSom(data.currentTotalUserBalance)}</p>
          </div>
        </>
      )}
    </div>
  );
}

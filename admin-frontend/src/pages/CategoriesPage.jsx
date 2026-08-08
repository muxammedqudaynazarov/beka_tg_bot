import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { api } from '../api';
import { showAlert } from '../telegram';
import SearchableSelect from '../components/SearchableSelect';

// 8-band: atamalar shu tartibda ishlatiladi —
//   "Тип"      = yuqori daraja (avvalgi "kategoriya"/WeaponCategory)
//   "Категория" = quyi daraja (avvalgi "sub-kategoriya"/WeaponSubcategory)
// Backend API yo'llari va maydon nomlari (categoryId/subcategoryId) o'zgarishsiz
// qoldi — bu faqat interfeysda ko'rinadigan matn almashuvi.

function CategoryAddForm({ typeId, onAdded }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.post(`/categories/${typeId}/subcategories`, { name: name.trim() });
      setName('');
      onAdded();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Произошла ошибка.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex gap-1.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Название новой категории"
        className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <button onClick={add} disabled={saving} className="rounded-md bg-accent px-2.5 text-xs font-semibold text-white disabled:opacity-50">
        <Plus size={13} />
      </button>
    </div>
  );
}

function TypeCard({ type, onChanged }) {
  const [expanded, setExpanded] = useState(false);

  async function removeCategory(id) {
    try {
      await api.delete(`/categories/subcategories/${id}`);
      onChanged();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Произошла ошибка.');
    }
  }

  async function removeType() {
    try {
      await api.delete(`/categories/${type.id}`);
      onChanged();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Произошла ошибка.');
    }
  }

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between px-3 py-2">
        <button onClick={() => setExpanded((v) => !v)} className="flex flex-1 items-center gap-2 text-left">
          {expanded ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
          <span className="text-sm font-medium text-ink">{type.name}</span>
          <span className="text-[10px] text-muted">({type.subcategories.length})</span>
        </button>
        <button onClick={removeType} className="text-[10px] text-danger">Удалить</button>
      </div>

      {expanded && (
        <div className="space-y-2 border-t border-border p-3">
          {type.subcategories.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-md bg-surface px-2.5 py-1.5">
              <span className="text-xs text-ink">{s.name}</span>
              <button onClick={() => removeCategory(s.id)} className="text-muted hover:text-danger">
                <X size={13} />
              </button>
            </div>
          ))}
          {!type.subcategories.length && <p className="text-[11px] text-muted">Пока нет категорий.</p>}
          <CategoryAddForm typeId={type.id} onAdded={onChanged} />
        </div>
      )}
    </div>
  );
}

export default function CategoriesPage() {
  const [types, setTypes] = useState(null);
  const [newTypeName, setNewTypeName] = useState('');
  const [savingType, setSavingType] = useState(false);

  // "Быстрое добавление" — live-search bilan Tip'ni tanlab, to'g'ridan-to'g'ri
  // shu yerdan Kategoriya qo'shish (ro'yxatni ochib-yopib yurmasdan).
  const [quickTypeId, setQuickTypeId] = useState('');
  const [quickCategoryName, setQuickCategoryName] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);

  function load() {
    api.get('/categories').then(({ data }) => setTypes(data.items || []));
  }
  useEffect(load, []);

  async function addType(e) {
    e.preventDefault();
    if (!newTypeName.trim()) return;
    setSavingType(true);
    try {
      await api.post('/categories', { name: newTypeName.trim() });
      setNewTypeName('');
      load();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Произошла ошибка.');
    } finally {
      setSavingType(false);
    }
  }

  async function quickAddCategory() {
    if (!quickTypeId || !quickCategoryName.trim()) return;
    setQuickSaving(true);
    try {
      await api.post(`/categories/${quickTypeId}/subcategories`, { name: quickCategoryName.trim() });
      setQuickCategoryName('');
      load();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Произошла ошибка.');
    } finally {
      setQuickSaving(false);
    }
  }

  const typeOptions = (types || []).map((t) => ({ value: t.id, label: t.name }));

  if (types === null) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-surface" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Новый тип</h2>
        <form onSubmit={addType} className="flex gap-2">
          <input
            value={newTypeName}
            onChange={(e) => setNewTypeName(e.target.value)}
            placeholder="Например: Ножи"
            className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <button disabled={savingType} className="rounded-md bg-accent px-4 text-sm font-semibold text-white disabled:opacity-50">
            Добавить
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
          Быстрое добавление категории (live-search)
        </h2>
        <div className="space-y-2 rounded-lg border border-border p-3">
          <SearchableSelect
            options={typeOptions}
            value={quickTypeId}
            onChange={setQuickTypeId}
            placeholder="Найдите тип…"
          />
          <div className="flex gap-2">
            <input
              value={quickCategoryName}
              onChange={(e) => setQuickCategoryName(e.target.value)}
              placeholder="Название категории (например AK-47)"
              className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <button
              onClick={quickAddCategory}
              disabled={quickSaving || !quickTypeId}
              className="rounded-md bg-accent px-3 text-xs font-semibold text-white disabled:opacity-50"
            >
              Добавить
            </button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
          Все типы ({types.length})
        </h2>
        <div className="space-y-2">
          {types.map((t) => (
            <TypeCard key={t.id} type={t} onChanged={load} />
          ))}
        </div>
      </section>
    </div>
  );
}

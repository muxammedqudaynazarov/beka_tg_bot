import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { api } from '../api';
import { showAlert } from '../telegram';
import SearchableSelect from '../components/SearchableSelect';

function SubcategoryAddForm({ categoryId, onAdded }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.post(`/categories/${categoryId}/subcategories`, { name: name.trim() });
      setName('');
      onAdded();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Xatolik yuz berdi.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex gap-1.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Yangi sub-kategoriya nomi"
        className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <button onClick={add} disabled={saving} className="rounded-md bg-accent px-2.5 text-xs font-semibold text-white disabled:opacity-50">
        <Plus size={13} />
      </button>
    </div>
  );
}

function CategoryCard({ category, onChanged }) {
  const [expanded, setExpanded] = useState(false);

  async function removeSubcategory(id) {
    try {
      await api.delete(`/categories/subcategories/${id}`);
      onChanged();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Xatolik yuz berdi.');
    }
  }

  async function removeCategory() {
    try {
      await api.delete(`/categories/${category.id}`);
      onChanged();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Xatolik yuz berdi.');
    }
  }

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between px-3 py-2">
        <button onClick={() => setExpanded((v) => !v)} className="flex flex-1 items-center gap-2 text-left">
          {expanded ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
          <span className="text-sm font-medium text-ink">{category.name}</span>
          <span className="text-[10px] text-muted">({category.subcategories.length})</span>
        </button>
        <button onClick={removeCategory} className="text-[10px] text-danger">O'chirish</button>
      </div>

      {expanded && (
        <div className="space-y-2 border-t border-border p-3">
          {category.subcategories.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-md bg-surface px-2.5 py-1.5">
              <span className="text-xs text-ink">{s.name}</span>
              <button onClick={() => removeSubcategory(s.id)} className="text-muted hover:text-danger">
                <X size={13} />
              </button>
            </div>
          ))}
          {!category.subcategories.length && <p className="text-[11px] text-muted">Hali sub-kategoriya yo'q.</p>}
          <SubcategoryAddForm categoryId={category.id} onAdded={onChanged} />
        </div>
      )}
    </div>
  );
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  // "Tez qo'shish" — live-search bilan kategoriyani tanlab, to'g'ridan-to'g'ri
  // shu yerdan sub-kategoriya qo'shish (ro'yxatni ochib-yopib yurmasdan).
  const [quickCategoryId, setQuickCategoryId] = useState('');
  const [quickSubName, setQuickSubName] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);

  function load() {
    api.get('/categories').then(({ data }) => setCategories(data.items || []));
  }
  useEffect(load, []);

  async function addCategory(e) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setSavingCategory(true);
    try {
      await api.post('/categories', { name: newCategoryName.trim() });
      setNewCategoryName('');
      load();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Xatolik yuz berdi.');
    } finally {
      setSavingCategory(false);
    }
  }

  async function quickAddSubcategory() {
    if (!quickCategoryId || !quickSubName.trim()) return;
    setQuickSaving(true);
    try {
      await api.post(`/categories/${quickCategoryId}/subcategories`, { name: quickSubName.trim() });
      setQuickSubName('');
      load();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Xatolik yuz berdi.');
    } finally {
      setQuickSaving(false);
    }
  }

  const categoryOptions = (categories || []).map((c) => ({ value: c.id, label: c.name }));

  if (categories === null) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-surface" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Yangi kategoriya</h2>
        <form onSubmit={addCategory} className="flex gap-2">
          <input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="Masalan: Ножи"
            className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <button disabled={savingCategory} className="rounded-md bg-accent px-4 text-sm font-semibold text-white disabled:opacity-50">
            Qo'shish
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
          Tez sub-kategoriya qo'shish (live-search)
        </h2>
        <div className="space-y-2 rounded-lg border border-border p-3">
          <SearchableSelect
            options={categoryOptions}
            value={quickCategoryId}
            onChange={setQuickCategoryId}
            placeholder="Kategoriyani qidiring…"
          />
          <div className="flex gap-2">
            <input
              value={quickSubName}
              onChange={(e) => setQuickSubName(e.target.value)}
              placeholder="Sub-kategoriya nomi (masalan AK-47)"
              className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <button
              onClick={quickAddSubcategory}
              disabled={quickSaving || !quickCategoryId}
              className="rounded-md bg-accent px-3 text-xs font-semibold text-white disabled:opacity-50"
            >
              Qo'shish
            </button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
          Barcha kategoriyalar ({categories.length})
        </h2>
        <div className="space-y-2">
          {categories.map((c) => (
            <CategoryCard key={c.id} category={c} onChanged={load} />
          ))}
        </div>
      </section>
    </div>
  );
}

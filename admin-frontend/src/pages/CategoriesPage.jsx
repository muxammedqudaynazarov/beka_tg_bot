import { useEffect, useState } from 'react';
import { api } from '../api';
import { showAlert } from '../telegram';

export default function CategoriesPage() {
  const [categories, setCategories] = useState(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    api.get('/categories').then(({ data }) => setCategories(data.items || []));
  }
  useEffect(load, []);

  async function addCategory(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.post('/categories', { name: name.trim() });
      setName('');
      load();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Xatolik yuz berdi.');
    } finally {
      setSaving(false);
    }
  }

  async function removeCategory(id) {
    try {
      await api.delete(`/categories/${id}`);
      load();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Xatolik yuz berdi.');
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={addCategory} className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Masalan: AK-47"
        />
        <button disabled={saving} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Qo'shish
        </button>
      </form>

      {categories === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-surface" />)}
        </div>
      ) : categories.length ? (
        <div className="divide-y divide-border rounded-lg border border-border">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-3 py-2.5">
              <span className="text-sm text-ink">{c.name}</span>
              <button onClick={() => removeCategory(c.id)} className="text-xs text-danger">O'chirish</button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted">Hali kategoriya yo'q.</p>
      )}
    </div>
  );
}

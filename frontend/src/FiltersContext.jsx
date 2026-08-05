import { createContext, useContext, useState } from 'react';

const DEFAULT_FILTERS = { categoryId: null, wear: [], statTrak: null, sort: null };

const FiltersContext = createContext(null);

export function FiltersProvider({ children }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const resetFilters = () => setFilters(DEFAULT_FILTERS);
  return (
    <FiltersContext.Provider value={{ filters, setFilters, resetFilters }}>{children}</FiltersContext.Provider>
  );
}

export function useFilters() {
  return useContext(FiltersContext);
}

'use client';

import React, { useEffect, useRef, useState } from 'react';

interface ProductSearchProps {
  value: string;
  onChange: (query: string) => void;
  placeholder?: string;
}

export function ProductSearch({ value, onChange, placeholder = 'Search by name or SKU…' }: ProductSearchProps) {
  const [localValue, setLocalValue] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setLocalValue(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onChange(v), 300);
  };

  return (
    <div className="product-search">
      <div className="product-search__icon">
        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>search</span>
      </div>
      <input
        id="product-search-input"
        type="search"
        className="product-search__input"
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        aria-label="Search products"
        autoComplete="off"
      />
      {localValue && (
        <button
          type="button"
          onClick={() => { setLocalValue(''); onChange(''); }}
          aria-label="Clear search"
          className="product-search__clear"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
        </button>
      )}
    </div>
  );
}

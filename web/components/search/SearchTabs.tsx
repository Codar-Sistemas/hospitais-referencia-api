'use client';
import type { ReactNode } from 'react';
import type { SearchMode } from '@/lib/types';

interface TabDefinition {
  id: SearchMode;
  label: string;
  shortLabel: string;
  icon: ReactNode;
}

const TABS: TabDefinition[] = [
  {
    id: 'city',
    label: 'Por cidade',
    shortLabel: 'Cidade',
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.8}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
        />
      </svg>
    ),
  },
  {
    id: 'cep',
    label: 'Por CEP',
    shortLabel: 'CEP',
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.8}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      </svg>
    ),
  },
  {
    id: 'animal',
    label: 'Por animal e estado',
    shortLabel: 'Animal',
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.8}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
        />
      </svg>
    ),
  },
];

interface SearchTabsProps {
  mode: SearchMode;
  onChange: (mode: SearchMode) => void;
  /** Which tabs to render — verticals without a treatment vocabulary
   * (e.g. rare-diseases) drop the 'animal' tab. Defaults to all. */
  modes?: ReadonlyArray<SearchMode>;
}

export default function SearchTabs({ mode, onChange, modes }: SearchTabsProps) {
  const visibleTabs = modes ? TABS.filter(({ id }) => modes.includes(id)) : TABS;
  return (
    <div className="flex border-b border-slate-100">
      {visibleTabs.map(({ id, label, shortLabel, icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-xs sm:text-sm font-medium transition-colors border-b-2 ${
            mode === id
              ? 'border-accent-600 text-accent-700 bg-accent-50/50'
              : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'
          }`}
        >
          {icon}
          <span className="hidden sm:inline">{label}</span>
          <span className="sm:hidden">{shortLabel}</span>
        </button>
      ))}
    </div>
  );
}

export const INPUT_CLASS =
  'w-full border border-slate-200 bg-white rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-shadow shadow-sm';

export const FIELD_LABEL_CLASS =
  'block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5';

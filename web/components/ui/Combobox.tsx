'use client';
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

export interface ComboboxOption {
  value: string;
  label: string;
  /**
   * Hidden text included in search matching. Useful when the displayed label
   * doesn't contain everything a user might type (e.g. include the state code
   * "SP" so typing "sp" still finds "São Paulo").
   */
  keywords?: string;
}

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  /**
   * When true, the input is grayed and shows the disabled placeholder
   * (e.g. "Selecione um estado primeiro" before the state is chosen).
   */
  disabledPlaceholder?: string;
}

// Accent-insensitive lowercase. Used for matching only — display preserves
// the original casing/diacritics.
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export default function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Selecione…',
  emptyMessage = 'Nenhuma opção encontrada',
  disabled = false,
  disabledPlaceholder,
  className = '',
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = normalize(query);
    return options.filter((opt) =>
      normalize(`${opt.label} ${opt.keywords ?? ''}`).includes(q),
    );
  }, [options, query]);

  // Close on outside click. Listening to mousedown so the click on a
  // dropdown item (which uses onMouseDown) still registers before close.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // Keep highlighted item in view while navigating with the keyboard.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLLIElement>(
      `[data-index="${highlightIndex}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex, open]);

  const handleSelect = useCallback(
    (option: ComboboxOption) => {
      onChange(option.value);
      setOpen(false);
      setQuery('');
      inputRef.current?.blur();
    },
    [onChange],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const opt = filtered[highlightIndex];
      if (opt) handleSelect(opt);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setQuery('');
      inputRef.current?.blur();
    } else if (event.key === 'Tab') {
      setOpen(false);
      setQuery('');
    }
  };

  const displayedValue = open ? query : (selectedOption?.label ?? '');
  const effectivePlaceholder = disabled
    ? (disabledPlaceholder ?? placeholder)
    : placeholder;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          value={displayedValue}
          placeholder={effectivePlaceholder}
          onFocus={() => !disabled && setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlightIndex(0);
            if (!open) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className={`w-full border border-slate-200 bg-white rounded-xl px-4 py-2.5 pr-9 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-shadow shadow-sm ${
            disabled ? 'opacity-60 cursor-not-allowed' : ''
          }`}
        />
        <svg
          className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {open && !disabled && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-64 overflow-auto bg-white border border-slate-200 rounded-xl shadow-lg py-1"
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-2 text-sm text-slate-400 italic">{emptyMessage}</li>
          ) : (
            filtered.map((opt, idx) => (
              <li
                key={opt.value}
                role="option"
                aria-selected={opt.value === value}
                data-index={idx}
                // Use onMouseDown (not onClick) so we fire BEFORE the input
                // blurs and triggers a close-via-outside-click.
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(opt);
                }}
                onMouseEnter={() => setHighlightIndex(idx)}
                className={`px-4 py-2 text-sm cursor-pointer ${
                  idx === highlightIndex
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'text-slate-700 hover:bg-slate-50'
                } ${opt.value === value ? 'font-semibold' : ''}`}
              >
                {opt.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

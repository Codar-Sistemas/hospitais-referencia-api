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
import { createPortal } from 'react-dom';

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
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
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
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  // The portal target is `document.body`, only available on the client.
  // Safe to skip a mounted-flag: `open` starts as false and only flips to
  // true via user interaction (onFocus/onChange), so SSR never renders
  // the portal and we never get a hydration mismatch.

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = normalize(query);
    return options.filter((opt) => normalize(`${opt.label} ${opt.keywords ?? ''}`).includes(q));
  }, [options, query]);

  // Close on outside click. Listening to mousedown so the click on a
  // dropdown item (which uses onMouseDown) still registers before close.
  // We accept clicks inside containerRef OR inside the portaled listbox.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (!containerRef.current?.contains(target) && !listRef.current?.contains(target)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // Compute the portal position from the input's bounding rect and keep
  // it in sync on scroll/resize while open. Using `position: fixed` lets
  // the dropdown escape any ancestor `overflow: hidden` clipping.
  useEffect(() => {
    if (!open) return;
    function updatePosition() {
      const rect = inputRef.current?.getBoundingClientRect();
      if (rect) {
        setPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width });
      }
    }
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open]);

  // Keep highlighted item in view while navigating with the keyboard.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLLIElement>(`[data-index="${highlightIndex}"]`);
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
  const effectivePlaceholder = disabled ? (disabledPlaceholder ?? placeholder) : placeholder;

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
          className={`w-full border border-slate-200 bg-white rounded-xl px-4 py-2.5 pr-9 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-shadow shadow-sm ${
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

      {open &&
        !disabled &&
        position &&
        createPortal(
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            style={{
              position: 'fixed',
              top: position.top,
              left: position.left,
              width: position.width,
            }}
            className="z-[60] max-h-64 overflow-auto bg-white border border-slate-200 rounded-xl shadow-lg py-1"
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
                      ? 'bg-accent-50 text-accent-800'
                      : 'text-slate-700 hover:bg-slate-50'
                  } ${opt.value === value ? 'font-semibold' : ''}`}
                >
                  {opt.label}
                </li>
              ))
            )}
          </ul>,
          document.body,
        )}
    </div>
  );
}

'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import SamuBadge from '@/components/SamuBadge';
import { LIVE_VERTICALS, THEME_DOT_CLASS } from '@/lib/verticals';

// Stats and docs are platform-wide (the API is one namespaced service, the
// stats endpoint is cross-vertical) — they live at the root, not under the
// vertical. Busca and Profissionais are vertical-scoped.
//
// The brand area splits in two: the "+" mark goes back to the hub, and the
// label opens a switcher listing every live vertical (derived from the
// registry — a new vertical shows up here with zero Navbar edits).
//
// Without a `vertical` (platform pages: /estatisticas, /docs, /termos) the
// navbar runs in platform mode: "MapaSUS" as the switcher label, only the
// platform-wide links, plus the GitHub link — same chrome as the hub header.
interface NavbarProps {
  vertical?: string;
  label?: string;
}

export default function Navbar({ vertical, label }: NavbarProps = {}) {
  const pathname = usePathname();
  const links = vertical
    ? [
        { href: `/${vertical}`, label: 'Busca' },
        { href: `/${vertical}/profissionais`, label: 'Profissionais' },
        { href: '/estatisticas', label: 'Estatísticas' },
        { href: '/docs', label: 'API' },
      ]
    : [
        { href: '/estatisticas', label: 'Estatísticas' },
        { href: '/docs', label: 'API' },
      ];
  const [isOpen, setIsOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);

  // Close drawer and switcher on route change — adjust state during render
  // (React 19 / set-state-in-effect compliant pattern).
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setIsOpen(false);
    setSwitcherOpen(false);
  }

  // Lock body scroll while drawer is open.
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  // Close drawer/switcher on Escape.
  useEffect(() => {
    if (!isOpen && !switcherOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setSwitcherOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, switcherOpen]);

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 shrink-0">
          <Link href="/" title="Início — MapaSUS" className="shrink-0">
            <div className="w-8 h-8 bg-accent-600 rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-sm">
              +
            </div>
          </Link>

          {/* Vertical switcher */}
          <div className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={switcherOpen}
              onClick={() => setSwitcherOpen((open) => !open)}
              className="flex items-center gap-1.5 font-semibold text-slate-800 text-base leading-tight rounded-lg px-2 py-1.5 -ml-2 hover:bg-slate-100 transition-colors"
            >
              {label ?? 'MapaSUS'}
              <svg
                className={`w-4 h-4 text-slate-400 transition-transform ${switcherOpen ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {switcherOpen && (
              <>
                {/* Invisible backdrop: closes the menu on outside click. */}
                <button
                  type="button"
                  aria-label="Fechar seletor de áreas"
                  onClick={() => setSwitcherOpen(false)}
                  className="fixed inset-0 z-[55] cursor-default"
                />
                <div
                  role="menu"
                  className="absolute left-0 top-full mt-2 w-64 z-[60] bg-white rounded-xl border border-slate-200 shadow-lg py-2"
                >
                  <Link
                    href="/"
                    role="menuitem"
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <span className="w-5 h-5 bg-emerald-600 rounded flex items-center justify-center text-white text-[10px] font-bold">
                      +
                    </span>
                    <span className="font-medium">Início — todas as áreas</span>
                  </Link>
                  <div className="my-1.5 border-t border-slate-100" />
                  <p className="px-4 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                    Áreas
                  </p>
                  {LIVE_VERTICALS.map((v) => {
                    const isCurrent = v.slug === vertical;
                    return (
                      <Link
                        key={v.slug}
                        href={`/${v.slug}`}
                        role="menuitem"
                        aria-current={isCurrent ? 'page' : undefined}
                        className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                          isCurrent
                            ? 'bg-slate-50 text-slate-900 font-semibold'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${THEME_DOT_CLASS[v.theme]}`} />
                        {v.label}
                        {isCurrent && (
                          <svg
                            className="w-4 h-4 ml-auto text-slate-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2.5}
                            aria-hidden="true"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                pathname === href
                  ? 'bg-accent-50 text-accent-700 font-semibold'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Desktop SAMU badge (+ GitHub on platform pages, matching the hub) */}
        <div className="hidden md:flex items-center gap-3">
          <SamuBadge />
          {!vertical && (
            <a
              href="https://github.com/Codar-Sistemas/hospitais-referencia-api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
            >
              GitHub ↗
            </a>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          aria-label="Abrir menu"
          aria-expanded={isOpen}
          aria-controls="mobile-drawer"
          onClick={() => setIsOpen(true)}
          className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Mobile drawer + backdrop */}
      <div
        className={`md:hidden fixed inset-0 z-[60] transition-opacity duration-200 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden={!isOpen}
      >
        {/* Backdrop */}
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setIsOpen(false)}
          className="absolute inset-0 bg-slate-900/50 w-full h-full"
        />

        {/* Drawer */}
        <aside
          id="mobile-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Menu de navegação"
          className={`absolute top-0 right-0 h-full w-72 max-w-[85vw] bg-white shadow-xl flex flex-col transform transition-transform duration-200 ease-out ${
            isOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200">
            <span className="font-semibold text-slate-800">Menu</span>
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setIsOpen(false)}
              className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-1">
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`px-4 py-3 rounded-lg text-base font-medium transition-colors ${
                  pathname === href
                    ? 'bg-accent-50 text-accent-700 font-semibold'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {label}
              </Link>
            ))}

            <p className="px-4 pt-5 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
              Áreas
            </p>
            <Link
              href="/"
              className="px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Início — todas as áreas
            </Link>
            {LIVE_VERTICALS.map((v) => {
              const isCurrent = v.slug === vertical;
              return (
                <Link
                  key={v.slug}
                  href={`/${v.slug}`}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={`flex items-center gap-2.5 px-4 py-3 rounded-lg text-base font-medium transition-colors ${
                    isCurrent
                      ? 'bg-slate-50 text-slate-900 font-semibold'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${THEME_DOT_CLASS[v.theme]}`} />
                  {v.label}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-slate-200">
            <a
              href="tel:192"
              className="flex items-center justify-center gap-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 px-4 py-3 rounded-lg transition-colors"
            >
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              SAMU 192 — Emergência
            </a>
          </div>
        </aside>
      </div>
    </header>
  );
}

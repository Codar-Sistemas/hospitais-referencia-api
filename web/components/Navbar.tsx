'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const links = [
  { href: '/',              label: 'Busca'         },
  { href: '/profissionais', label: 'Profissionais' },
  { href: '/stats',         label: 'Estatísticas'  },
  { href: '/docs',          label: 'API'           },
];

export default function Navbar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);

  // Close drawer on route change — adjust state during render
  // (React 19 / set-state-in-effect compliant pattern).
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setIsOpen(false);
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

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-sm">
            +
          </div>
          <span className="font-semibold text-slate-800 text-base leading-tight">
            Hospitais<span className="hidden sm:inline"> de Referência</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                pathname === href
                  ? 'bg-emerald-50 text-emerald-700 font-semibold'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Desktop SAMU badge */}
        <a
          href="tel:192"
          className="hidden md:flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-full hover:bg-red-100 transition-colors"
        >
          <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
          SAMU 192
        </a>

        {/* Mobile hamburger */}
        <button
          type="button"
          aria-label="Abrir menu"
          aria-expanded={isOpen}
          aria-controls="mobile-drawer"
          onClick={() => setIsOpen(true)}
          className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                    ? 'bg-emerald-50 text-emerald-700 font-semibold'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {label}
              </Link>
            ))}
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

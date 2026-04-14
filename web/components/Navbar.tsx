'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/',              label: 'Busca'         },
  { href: '/profissionais', label: 'Profissionais' },
  { href: '/docs',          label: 'API'           },
];

export default function Navbar() {
  const pathname = usePathname();
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-sm">
            +
          </div>
          <span className="font-semibold text-slate-800 text-base leading-tight">
            Hospitais<br className="sm:hidden" />
            <span className="hidden sm:inline"> de Referência</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1">
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

        <a
          href="tel:192"
          className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-full hover:bg-red-100 transition-colors"
        >
          <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
          SAMU 192
        </a>
      </div>
    </header>
  );
}

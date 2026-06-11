import Link from 'next/link';
import Footer from '@/components/Footer';
import { LIVE_VERTICALS } from '@/lib/verticals';

// Chrome for platform-wide pages (stats, docs, termos). These aren't tied to a
// single vertical, so they get a neutral MapaSUS header/footer rather than the
// vertical Navbar (which lives in app/[vertical]/layout.tsx).
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col flex-1">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-sm">
              +
            </div>
            <span className="font-bold text-slate-800 text-lg tracking-tight">MapaSUS</span>
          </Link>
          <nav className="flex items-center gap-1">
            {LIVE_VERTICALS.map((v) => (
              <Link
                key={v.slug}
                href={`/${v.slug}`}
                className="px-3 py-2 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              >
                {v.shortLabel}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <Footer className="mt-12" />
    </div>
  );
}

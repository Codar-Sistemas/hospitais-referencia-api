import Link from 'next/link';

// Shared site footer (hub, platform pages and vertical layouts). The logo
// square uses `bg-accent-600`, which resolves to the vertical's theme under a
// `data-theme` wrapper and to the default (emerald) everywhere else — one
// component serves every chrome. Vertical layouts pass their label/sourceUrl.
export default function Footer({
  verticalLabel,
  sourceUrl,
  className = 'mt-auto',
}: {
  verticalLabel?: string;
  sourceUrl?: string;
  className?: string;
}) {
  return (
    <footer className={`border-t border-slate-200 bg-white py-8 ${className}`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-400">
        <Link href="/" className="flex items-center gap-2 hover:text-slate-600 transition-colors">
          <div className="w-6 h-6 bg-accent-600 rounded flex items-center justify-center text-white text-xs font-bold">
            +
          </div>
          <span className="font-medium text-slate-500">
            {verticalLabel ? `MapaSUS · ${verticalLabel}` : 'MapaSUS'}
          </span>
        </Link>
        <p className="text-center">
          Dados:{' '}
          {sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-600 hover:underline"
            >
              Ministério da Saúde
            </a>
          ) : (
            'Ministério da Saúde'
          )}{' '}
          · Atualização automática diária
        </p>
        <div className="flex items-center gap-4">
          <Link href="/termos" className="hover:text-slate-600 transition-colors">
            Termos de uso
          </Link>
          <Link href="/docs" className="hover:text-slate-600 transition-colors">
            API
          </Link>
          <a
            href="https://github.com/Codar-Sistemas/hospitais-referencia-api"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-600 transition-colors"
          >
            GitHub ↗
          </a>
        </div>
      </div>
    </footer>
  );
}

'use client';
import { useEffect, useState } from 'react';

// Sidebar nav for the API docs. Ids here MUST match the `id` of each section /
// <Endpoint> on the docs page — they are the single source of anchor truth.
interface NavItem {
  id: string;
  label: string;
  method?: 'GET' | 'POST';
}
interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    title: 'Começando',
    items: [
      { id: 'introducao', label: 'Introdução' },
      { id: 'verticais', label: 'Verticais e rotas' },
      { id: 'uso-responsavel', label: 'Uso responsável' },
    ],
  },
  {
    title: 'Filtros',
    items: [
      { id: 'filtro-treatment', label: 'treatment — soros' },
      { id: 'filtro-disease', label: 'disease — habilitações' },
    ],
  },
  {
    title: 'Estados',
    items: [
      { id: 'states-list', label: '/v1/states', method: 'GET' },
      { id: 'states-detail', label: '/v1/states/:uf', method: 'GET' },
      { id: 'ciatox', label: '/v1/ciatox/:uf', method: 'GET' },
    ],
  },
  {
    title: 'Hospitais',
    items: [
      { id: 'hospitals-list', label: '/{vertical}/hospitals', method: 'GET' },
      { id: 'hospitals-nearby', label: '/hospitals/nearby', method: 'GET' },
      { id: 'hospitals-id', label: '/v1/hospitals/:id', method: 'GET' },
    ],
  },
  {
    title: 'Busca e métricas',
    items: [
      { id: 'search', label: '/v1/search', method: 'GET' },
      { id: 'stats', label: '/v1/stats', method: 'GET' },
    ],
  },
  {
    title: 'Referência',
    items: [
      { id: 'legenda', label: 'Legenda dos campos' },
      { id: 'exemplos', label: 'Exemplos de integração' },
    ],
  },
];

const ALL_IDS = NAV.flatMap((g) => g.items.map((i) => i.id));

function MethodTag({ method }: { method: 'GET' | 'POST' }) {
  return (
    <span
      className={`shrink-0 text-[9px] font-bold px-1 py-px rounded ${
        method === 'GET' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
      }`}
    >
      {method}
    </span>
  );
}

export default function DocsSidebar() {
  const [active, setActive] = useState<string>(ALL_IDS[0] ?? '');
  const [mobileOpen, setMobileOpen] = useState(false);

  // Scroll-spy: highlight the section nearest the top of the viewport.
  useEffect(() => {
    const sections = ALL_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActive(visible[0].target.id);
      },
      // Trigger when a heading crosses the band just below the sticky header.
      { rootMargin: '-72px 0px -70% 0px', threshold: 0 },
    );
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  function handleClick() {
    setMobileOpen(false);
  }

  const list = (
    <nav className="flex flex-col gap-5">
      {NAV.map((group) => (
        <div key={group.title}>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 px-2">
            {group.title}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  onClick={handleClick}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[13px] transition-colors ${
                    active === item.id
                      ? 'bg-emerald-50 text-emerald-700 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {item.method && <MethodTag method={item.method} />}
                  <span className="font-mono truncate">{item.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Desktop: sticky sidebar */}
      <aside className="hidden lg:block w-60 shrink-0">
        <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-10 pr-2">
          {list}
        </div>
      </aside>

      {/* Mobile: collapsible "Nesta página" */}
      <div className="lg:hidden mb-6">
        <button
          type="button"
          onClick={() => setMobileOpen((o) => !o)}
          aria-expanded={mobileOpen}
          className="w-full flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 shadow-sm"
        >
          Nesta página
          <svg
            className={`w-4 h-4 transition-transform ${mobileOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {mobileOpen && (
          <div className="mt-2 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            {list}
          </div>
        )}
      </div>
    </>
  );
}

'use client';
import { useState, useTransition } from 'react';
import { buscarHospitais, buscarProximos, ESTADOS, ANIMAIS, Hospital } from '@/lib/api';

const TIPOS_CANONICOS = [
  'Botrópico','Crotálico','Elapídico','Laquético',
  'Escorpiônico','Loxoscélico','Foneutrico','Lonômico',
];

const BADGE_TIPO: Record<string, string> = {
  'Botrópico':    'text-orange-600',
  'Crotálico':    'text-red-600',
  'Elapídico':    'text-pink-600',
  'Laquético':    'text-purple-600',
  'Escorpiônico': 'text-amber-600',
  'Loxoscélico':  'text-yellow-600',
  'Foneutrico':   'text-blue-600',
  'Lonômico':     'text-emerald-600',
};

export default function Profissionais() {
  const [uf, setUf] = useState('');
  const [animal, setAnimal] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [cep, setCep] = useState('');
  const [raio, setRaio] = useState('50000');
  const [hospitais, setHospitais] = useState<Hospital[]>([]);
  const [erro, setErro] = useState('');
  const [buscou, setBuscou] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setBuscou(false);
    startTransition(async () => {
      try {
        let resultado: Hospital[] = [];
        if (cep.replace(/\D/g, '').length === 8) {
          const data = await buscarProximos({ cep: cep.replace(/\D/g, ''), atendimento: animal || undefined, raio: parseInt(raio), limit: 200 });
          resultado = data.hospitais;
        } else {
          if (!uf && !municipio) { setErro('Informe estado ou município.'); return; }
          resultado = await buscarHospitais({ uf: uf || undefined, municipio: municipio || undefined, atendimento: animal || undefined, limit: 500 });
        }
        setHospitais(resultado);
        setBuscou(true);
        if (resultado.length === 0) setErro('Nenhum hospital encontrado.');
      } catch {
        setErro('Erro ao buscar. Tente novamente.');
      }
    });
  }

  const inputClass = 'border border-slate-200 bg-white rounded-xl px-3 py-2.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent shadow-sm text-slate-800 placeholder-slate-400';

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-7">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Consulta para Profissionais</h1>
        </div>
        <p className="text-slate-500 text-sm">Visão técnica com CNES, grade completa de soros e busca avançada.</p>
      </div>

      {/* Filter form */}
      <form onSubmit={buscar} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Estado</label>
            <select value={uf} onChange={(e) => setUf(e.target.value)} className={inputClass}>
              <option value="">Todos</option>
              {ESTADOS.map((e) => <option key={e.uf} value={e.uf}>{e.uf} – {e.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Município</label>
            <input value={municipio} onChange={(e) => setMunicipio(e.target.value)}
              placeholder="Ex: Campinas" className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">CEP</label>
            <input value={cep} onChange={(e) => setCep(e.target.value)}
              placeholder="00000-000" maxLength={9} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Raio</label>
            <select value={raio} onChange={(e) => setRaio(e.target.value)} className={inputClass}>
              <option value="20000">20 km</option>
              <option value="50000">50 km</option>
              <option value="100000">100 km</option>
              <option value="200000">200 km</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Tipo de soro</label>
            <select value={animal} onChange={(e) => setAnimal(e.target.value)} className={inputClass}>
              <option value="">Todos</option>
              {ANIMAIS.map((a) => <option key={a.valor} value={a.valor}>{a.emoji} {a.label}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={isPending}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors shadow-sm">
              {isPending ? 'Buscando...' : 'Buscar'}
            </button>
          </div>
        </div>
        {erro && (
          <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            {erro}
          </div>
        )}
      </form>

      {/* Results table */}
      {buscou && hospitais.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-slate-600">
              <span className="text-slate-900 font-bold">{hospitais.length}</span> resultado{hospitais.length !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="text-emerald-600 font-bold">✓</span> = atende
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap text-xs uppercase tracking-wide">Unidade</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide whitespace-nowrap">Município</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">CNES</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Telefone</th>
                  {TIPOS_CANONICOS.map((t) => (
                    <th key={t} className={`px-2 py-3 font-semibold text-xs uppercase tracking-wide whitespace-nowrap text-center ${BADGE_TIPO[t] ?? 'text-slate-500'}`}>
                      {t.replace('ônico','').replace('élico','').replace('tico','').replace('ico','')}
                    </th>
                  ))}
                  {hospitais.some((h) => h.distancia_km !== undefined) && (
                    <th className="px-4 py-3 font-semibold text-slate-600 text-right text-xs uppercase tracking-wide whitespace-nowrap">Dist.</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hospitais.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 max-w-xs">
                      <div className="font-medium text-slate-900 truncate text-sm">{h.unidade}</div>
                      {h.endereco && (
                        <div className="text-xs text-slate-400 truncate mt-0.5">{h.endereco}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-sm">
                      {h.municipio}
                      <span className="ml-1.5 text-xs font-semibold text-slate-400">{h.uf}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{h.cnes ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">
                      {h.telefones ? (
                        <a href={`tel:${h.telefones.replace(/\D/g,'')}`} className="hover:text-emerald-600 transition-colors">
                          {h.telefones}
                        </a>
                      ) : '—'}
                    </td>
                    {TIPOS_CANONICOS.map((t) => (
                      <td key={t} className="px-2 py-3 text-center">
                        {h.atendimentos.includes(t) ? (
                          <span className={`text-sm font-bold ${BADGE_TIPO[t] ?? 'text-slate-400'}`}>✓</span>
                        ) : (
                          <span className="text-slate-200 text-sm">—</span>
                        )}
                      </td>
                    ))}
                    {hospitais.some((h2) => h2.distancia_km !== undefined) && (
                      <td className="px-4 py-3 text-right text-xs text-slate-500 whitespace-nowrap font-medium">
                        {h.distancia_km !== undefined ? `${h.distancia_km.toFixed(1)} km` : '—'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

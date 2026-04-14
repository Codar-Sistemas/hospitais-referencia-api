'use client';
import { useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import HospitalCard from '@/components/HospitalCard';
import { buscarHospitais, buscarProximos, ESTADOS, ANIMAIS, Hospital } from '@/lib/api';

const HospitalMap = dynamic(() => import('@/components/HospitalMap'), { ssr: false });

type Modo = 'animal' | 'cep' | 'cidade';

const MODOS = [
  { id: 'animal' as Modo, label: 'Por animal e estado', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
    </svg>
  )},
  { id: 'cep' as Modo, label: 'Por CEP', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
    </svg>
  )},
  { id: 'cidade' as Modo, label: 'Por cidade', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
    </svg>
  )},
];

export default function Home() {
  const [modo, setModo] = useState<Modo>('animal');
  const [uf, setUf] = useState('');
  const [animal, setAnimal] = useState('');
  const [cidade, setCidade] = useState('');
  const [cep, setCep] = useState('');
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
        if (modo === 'cep') {
          const data = await buscarProximos({ cep: cep.replace(/\D/g, ''), atendimento: animal || undefined, raio: 100000, limit: 50 });
          resultado = data.hospitais;
        } else if (modo === 'cidade') {
          resultado = await buscarHospitais({ municipio: cidade, uf: uf || undefined, atendimento: animal || undefined, limit: 100 });
        } else {
          if (!uf) { setErro('Selecione um estado.'); return; }
          resultado = await buscarHospitais({ uf, atendimento: animal || undefined, limit: 200 });
        }
        setHospitais(resultado);
        setBuscou(true);
        if (resultado.length === 0) setErro('Nenhum hospital encontrado com esses filtros.');
      } catch {
        setErro('Erro ao buscar. Verifique sua conexão e tente novamente.');
      }
    });
  }

  const inputClass = 'w-full border border-slate-200 bg-white rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-shadow shadow-sm';

  return (
    <div>
      {/* Hero */}
      <div className="bg-white border-b border-slate-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-12 pb-10 text-center">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 px-3 py-1 rounded-full mb-5">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
            Dados oficiais do Ministério da Saúde
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight tracking-tight">
            Hospitais com soro antiofídico
            <br />
            <span className="text-emerald-600">e antiveneno no Brasil</span>
          </h1>
          <p className="mt-4 text-slate-500 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
            Encontre a unidade de referência mais próxima em caso de acidente com animais peçonhentos.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-red-600 bg-red-50 border border-red-200 px-4 py-2 rounded-full">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            Em emergência, ligue para o SAMU: 192
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-slate-100">
            {MODOS.map(({ id, label, icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setModo(id)}
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-xs sm:text-sm font-medium transition-colors border-b-2 ${
                  modo === id
                    ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                    : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                }`}
              >
                {icon}
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{id === 'animal' ? 'Animal' : id === 'cep' ? 'CEP' : 'Cidade'}</span>
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={buscar} className="p-5 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {modo === 'animal' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Estado *</label>
                    <select value={uf} onChange={(e) => setUf(e.target.value)} className={inputClass}>
                      <option value="">Selecione o estado</option>
                      {ESTADOS.map((e) => <option key={e.uf} value={e.uf}>{e.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Animal (opcional)</label>
                    <select value={animal} onChange={(e) => setAnimal(e.target.value)} className={inputClass}>
                      <option value="">Todos os tipos</option>
                      {ANIMAIS.map((a) => <option key={a.valor} value={a.valor}>{a.emoji} {a.label}</option>)}
                    </select>
                  </div>
                </>
              )}
              {modo === 'cep' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">CEP *</label>
                    <input
                      value={cep} onChange={(e) => setCep(e.target.value)}
                      placeholder="00000-000" maxLength={9} className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Animal (opcional)</label>
                    <select value={animal} onChange={(e) => setAnimal(e.target.value)} className={inputClass}>
                      <option value="">Todos os tipos</option>
                      {ANIMAIS.map((a) => <option key={a.valor} value={a.valor}>{a.emoji} {a.label}</option>)}
                    </select>
                  </div>
                </>
              )}
              {modo === 'cidade' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Cidade *</label>
                    <input
                      value={cidade} onChange={(e) => setCidade(e.target.value)}
                      placeholder="Ex: Campinas" className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Estado (opcional)</label>
                    <select value={uf} onChange={(e) => setUf(e.target.value)} className={inputClass}>
                      <option value="">Todos os estados</option>
                      {ESTADOS.map((e) => <option key={e.uf} value={e.uf}>{e.nome}</option>)}
                    </select>
                  </div>
                </>
              )}
            </div>

            {erro && (
              <div className="mt-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                {erro}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="mt-5 w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-semibold py-3 rounded-xl transition-colors shadow-sm text-sm"
            >
              {isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Buscando...
                </span>
              ) : 'Buscar hospitais'}
            </button>
          </form>
        </div>

        {/* Results */}
        {buscou && hospitais.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800">
                {hospitais.length} hospital{hospitais.length !== 1 ? 'is' : ''} encontrado{hospitais.length !== 1 ? 's' : ''}
              </h2>
              {hospitais.some(h => h.distancia_km !== undefined) && (
                <span className="text-xs text-slate-400">Ordenado por distância</span>
              )}
            </div>
            <div className="mb-5 rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
              <HospitalMap hospitais={hospitais} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {hospitais.map((h) => <HospitalCard key={h.id} hospital={h} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

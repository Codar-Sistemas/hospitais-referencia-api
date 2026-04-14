'use client';
import { useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import HospitalCard from '@/components/HospitalCard';
import { buscarHospitais, buscarProximos, ESTADOS, ANIMAIS, Hospital } from '@/lib/api';

const HospitalMap = dynamic(() => import('@/components/HospitalMap'), { ssr: false });

type Modo = 'animal' | 'cep' | 'cidade';

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
        setErro('Erro ao buscar. Tente novamente.');
      }
    });
  }

  const selectClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500';

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Hospitais de Referência para<br />
          <span className="text-green-700">Animais Peçonhentos</span>
        </h1>
        <p className="mt-3 text-gray-500 text-lg">
          Encontre o hospital mais próximo com soro antiofídico e antiveneno no Brasil.
        </p>
        <p className="mt-2 text-sm text-red-600 font-semibold">
          ⚠️ Em caso de acidente, ligue primeiro para o SAMU: 192
        </p>
      </div>

      <form onSubmit={buscar} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-lg">
          {([
            { id: 'animal', label: '🐍 Por animal / estado' },
            { id: 'cep',    label: '📍 Por CEP' },
            { id: 'cidade', label: '🏙️ Por cidade' },
          ] as { id: Modo; label: string }[]).map(({ id, label }) => (
            <button key={id} type="button" onClick={() => setModo(id)}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                modo === id ? 'bg-white shadow text-green-700' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {modo === 'animal' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estado *</label>
                <select value={uf} onChange={(e) => setUf(e.target.value)} className={selectClass}>
                  <option value="">Selecione o estado</option>
                  {ESTADOS.map((e) => <option key={e.uf} value={e.uf}>{e.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Animal (opcional)</label>
                <select value={animal} onChange={(e) => setAnimal(e.target.value)} className={selectClass}>
                  <option value="">Todos os tipos</option>
                  {ANIMAIS.map((a) => <option key={a.valor} value={a.valor}>{a.emoji} {a.label}</option>)}
                </select>
              </div>
            </>
          )}
          {modo === 'cep' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CEP *</label>
                <input value={cep} onChange={(e) => setCep(e.target.value)}
                  placeholder="00000-000" maxLength={9} className={selectClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Animal (opcional)</label>
                <select value={animal} onChange={(e) => setAnimal(e.target.value)} className={selectClass}>
                  <option value="">Todos os tipos</option>
                  {ANIMAIS.map((a) => <option key={a.valor} value={a.valor}>{a.emoji} {a.label}</option>)}
                </select>
              </div>
            </>
          )}
          {modo === 'cidade' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cidade *</label>
                <input value={cidade} onChange={(e) => setCidade(e.target.value)}
                  placeholder="Ex: Campinas" className={selectClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estado (opcional)</label>
                <select value={uf} onChange={(e) => setUf(e.target.value)} className={selectClass}>
                  <option value="">Todos</option>
                  {ESTADOS.map((e) => <option key={e.uf} value={e.uf}>{e.nome}</option>)}
                </select>
              </div>
            </>
          )}
        </div>

        <button type="submit" disabled={isPending}
          className="mt-5 w-full bg-green-700 hover:bg-green-800 disabled:bg-green-400 text-white font-semibold py-2.5 rounded-lg transition-colors">
          {isPending ? 'Buscando...' : 'Buscar hospitais'}
        </button>

        {erro && <p className="mt-3 text-sm text-red-600 text-center">{erro}</p>}
      </form>

      {buscou && hospitais.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold text-gray-800 mb-4">
            {hospitais.length} hospital{hospitais.length !== 1 ? 'is' : ''} encontrado{hospitais.length !== 1 ? 's' : ''}
          </h2>
          <div className="mb-6">
            <HospitalMap hospitais={hospitais} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {hospitais.map((h) => <HospitalCard key={h.id} hospital={h} />)}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';
import { useState, useTransition } from 'react';
import { buscarHospitais, buscarProximos, ESTADOS, ANIMAIS, Hospital } from '@/lib/api';

const TIPOS_CANONICOS = [
  'Botrópico','Crotálico','Elapídico','Laquético',
  'Escorpiônico','Loxoscélico','Foneutrico','Lonômico',
];

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

  const inputClass = 'border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Consulta para Profissionais de Saúde</h1>
        <p className="text-gray-500 mt-1">Visualização técnica com CNES, todos os tipos de soro e busca avançada.</p>
      </div>

      <form onSubmit={buscar} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
            <select value={uf} onChange={(e) => setUf(e.target.value)} className={inputClass}>
              <option value="">Todos</option>
              {ESTADOS.map((e) => <option key={e.uf} value={e.uf}>{e.uf} – {e.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Município</label>
            <input value={municipio} onChange={(e) => setMunicipio(e.target.value)}
              placeholder="Ex: Campinas" className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">CEP (busca próximos)</label>
            <input value={cep} onChange={(e) => setCep(e.target.value)}
              placeholder="00000-000" maxLength={9} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Raio (km)</label>
            <select value={raio} onChange={(e) => setRaio(e.target.value)} className={inputClass}>
              <option value="20000">20 km</option>
              <option value="50000">50 km</option>
              <option value="100000">100 km</option>
              <option value="200000">200 km</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de soro</label>
            <select value={animal} onChange={(e) => setAnimal(e.target.value)} className={inputClass}>
              <option value="">Todos</option>
              {ANIMAIS.map((a) => <option key={a.valor} value={a.valor}>{a.label}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={isPending}
              className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white font-semibold py-2 rounded-lg text-sm transition-colors">
              {isPending ? 'Buscando...' : 'Buscar'}
            </button>
          </div>
        </div>
        {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}
      </form>

      {buscou && hospitais.length > 0 && (
        <>
          <div className="text-sm text-gray-500 mb-3">
            {hospitais.length} resultado{hospitais.length !== 1 ? 's' : ''}
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Unidade</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Município / UF</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">CNES</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Telefone</th>
                  {TIPOS_CANONICOS.map((t) => (
                    <th key={t} className="px-2 py-3 font-semibold text-gray-600 whitespace-nowrap text-center text-xs">
                      {t}
                    </th>
                  ))}
                  {hospitais.some((h) => h.distancia_km !== undefined) && (
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">Dist.</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {hospitais.map((h) => (
                  <tr key={h.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-xs">
                      <div className="truncate">{h.unidade}</div>
                      {h.endereco && (
                        <div className="text-xs text-gray-400 truncate mt-0.5">{h.endereco}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {h.municipio}<br />
                      <span className="text-xs font-semibold text-gray-400">{h.uf}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{h.cnes ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">{h.telefones ?? '—'}</td>
                    {TIPOS_CANONICOS.map((t) => (
                      <td key={t} className="px-2 py-3 text-center">
                        {h.atendimentos.includes(t) ? (
                          <span className="text-green-600 font-bold">✓</span>
                        ) : (
                          <span className="text-gray-200">—</span>
                        )}
                      </td>
                    ))}
                    {hospitais.some((h2) => h2.distancia_km !== undefined) && (
                      <td className="px-4 py-3 text-right text-xs text-gray-500 whitespace-nowrap">
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

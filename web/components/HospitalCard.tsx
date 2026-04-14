import { Hospital } from '@/lib/api';

const CORES: Record<string, string> = {
  'Botrópico':   'bg-orange-100 text-orange-800',
  'Crotálico':   'bg-red-100 text-red-800',
  'Elapídico':   'bg-pink-100 text-pink-800',
  'Laquético':   'bg-purple-100 text-purple-800',
  'Escorpiônico':'bg-yellow-100 text-yellow-800',
  'Loxoscélico': 'bg-amber-100 text-amber-800',
  'Foneutrico':  'bg-blue-100 text-blue-800',
  'Lonômico':    'bg-green-100 text-green-800',
};

export default function HospitalCard({ hospital }: { hospital: Hospital }) {
  const maps = hospital.endereco
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${hospital.unidade} ${hospital.endereco}`
      )}`
    : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-gray-900 leading-snug">{hospital.unidade}</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {hospital.municipio} · {hospital.uf}
          </p>
        </div>
        {hospital.distancia_km !== undefined && (
          <span className="shrink-0 text-xs font-semibold bg-green-100 text-green-800 px-2 py-1 rounded-full">
            {hospital.distancia_km < 1
              ? `${hospital.distancia_m?.toFixed(0)} m`
              : `${hospital.distancia_km.toFixed(1)} km`}
          </span>
        )}
      </div>

      {hospital.endereco && (
        <p className="text-sm text-gray-600 mt-2">📍 {hospital.endereco}</p>
      )}
      {hospital.telefones && (
        <p className="text-sm text-gray-600 mt-1">📞 {hospital.telefones}</p>
      )}

      <div className="flex flex-wrap gap-1 mt-3">
        {hospital.atendimentos.map((a) => (
          <span
            key={a}
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${CORES[a] ?? 'bg-gray-100 text-gray-700'}`}
          >
            {a}
          </span>
        ))}
      </div>

      {maps && (
        <a
          href={maps}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-xs text-green-700 hover:underline"
        >
          Ver no mapa →
        </a>
      )}
    </div>
  );
}

import { Hospital } from '@/lib/api';

const BADGE: Record<string, string> = {
  'Botrópico':    'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  'Crotálico':    'bg-red-50 text-red-700 ring-1 ring-red-200',
  'Elapídico':    'bg-pink-50 text-pink-700 ring-1 ring-pink-200',
  'Laquético':    'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
  'Escorpiônico': 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  'Loxoscélico':  'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200',
  'Foneutrico':   'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  'Lonômico':     'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
};

export default function HospitalCard({ hospital }: { hospital: Hospital }) {
  const maps = hospital.endereco
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${hospital.unidade} ${hospital.endereco} ${hospital.municipio}`
      )}`
    : null;

  const requerVerificacao = hospital.requer_verificacao === true;

  return (
    <div className={`bg-white rounded-2xl border p-5 shadow-sm hover:shadow-md transition-all group ${
      requerVerificacao
        ? 'border-amber-300 hover:border-amber-400'
        : 'border-slate-200 hover:border-slate-300'
    }`}>
      {requerVerificacao && (
        <div className="mb-3 flex items-start gap-2 text-xs bg-amber-50 text-amber-800 ring-1 ring-amber-200 rounded-lg px-3 py-2">
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>
            <strong>Dados extraídos por OCR.</strong> Este estado publica o PDF como imagem escaneada,
            e os campos de texto livre (nome, endereço, telefone) podem conter erros.{' '}
            <strong>Confirme antes de usar em emergência.</strong>
          </span>
        </div>
      )}

      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900 leading-snug text-sm group-hover:text-emerald-700 transition-colors">
            {hospital.unidade}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 font-medium">
            {hospital.municipio} &middot; {hospital.uf}
          </p>
        </div>
        {hospital.distancia_km !== undefined && (
          <span className="shrink-0 text-xs font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 px-2.5 py-1 rounded-full">
            {hospital.distancia_km < 1
              ? `${hospital.distancia_m?.toFixed(0)} m`
              : `${hospital.distancia_km.toFixed(1)} km`}
          </span>
        )}
      </div>

      <div className="space-y-1.5 mb-3">
        {hospital.endereco && (
          <p className="text-xs text-slate-500 flex items-start gap-1.5">
            <svg className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {hospital.endereco}
          </p>
        )}
        {hospital.telefones && (
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <a href={`tel:${hospital.telefones.replace(/\D/g,'')}`} className="hover:text-emerald-600 transition-colors">
              {hospital.telefones}
            </a>
          </p>
        )}
        {hospital.cnes && (
          <p className="text-xs text-slate-400">CNES: {hospital.cnes}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {hospital.atendimentos.map((a) => (
          <span
            key={a}
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${BADGE[a] ?? 'bg-slate-100 text-slate-600'}`}
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
          className="mt-3 inline-flex items-center gap-1 text-xs text-emerald-600 font-medium hover:text-emerald-700 transition-colors"
        >
          Ver no mapa
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      )}
    </div>
  );
}

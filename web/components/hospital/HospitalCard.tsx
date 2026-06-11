'use client';
import type { Hospital } from '@/lib/types';
import { TREATMENT_BADGE_CLASS, TREATMENT_LABEL_BY_VALUE } from '@/lib/constants';
import { specialtyBadges } from '@/lib/specialties';
import { emit } from '@/lib/telemetry';
import WarningIcon from '@/components/WarningIcon';

interface HospitalCardProps {
  hospital: Hospital;
  /** Hide the treatment badges on verticals without a treatment vocabulary
   * (e.g. rare-diseases) — a hospital shared with the venomous vertical
   * would otherwise surface snake-serum badges out of context. */
  showTreatments?: boolean;
}

export default function HospitalCard({ hospital, showTreatments = true }: HospitalCardProps) {
  // Disease-area badges from the vertical's qualifications (rare-diseases
  // et al.) — the counterpart of the venomous treatment badges below.
  const qualificationBadges = specialtyBadges(hospital);

  const mapsUrl = hospital.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${hospital.name} ${hospital.address} ${hospital.city}`,
      )}`
    : null;

  const requiresVerification = hospital.requires_verification === true;

  return (
    <div
      className={`bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group ${
        requiresVerification
          ? 'border-2 border-red-300 hover:border-red-400 ring-1 ring-red-100'
          : 'border border-slate-200 hover:border-slate-300'
      }`}
    >
      {requiresVerification && (
        <div className="mb-3 flex items-start gap-2.5 text-xs bg-red-50 text-red-900 ring-2 ring-red-300 rounded-lg px-3 py-2.5">
          <WarningIcon className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
          <div className="space-y-1">
            <p className="font-bold uppercase tracking-wide text-red-700 text-[11px]">
              ⚠ Dados não verificados
            </p>
            <p className="leading-snug">
              Estas informações foram extraídas <strong>automaticamente de uma imagem</strong> do
              PDF oficial. <strong>A exatidão não é garantida</strong> — nome do hospital, endereço
              e telefone podem conter erros de leitura.
            </p>
            <p className="leading-snug font-semibold">
              Em caso de emergência, ligue{' '}
              <a href="tel:192" className="underline">
                192 (SAMU)
              </a>{' '}
              antes de se deslocar.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900 leading-snug text-sm group-hover:text-accent-700 transition-colors">
            {hospital.name}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 font-medium">
            {hospital.city} &middot; {hospital.state_code}
          </p>
        </div>
        {hospital.distance_km !== undefined && (
          <span className="shrink-0 text-xs font-semibold bg-accent-50 text-accent-700 ring-1 ring-accent-200 px-2.5 py-1 rounded-full">
            {hospital.distance_km < 1
              ? `${hospital.distance_m?.toFixed(0)} m`
              : `${hospital.distance_km.toFixed(1)} km`}
          </span>
        )}
      </div>

      <div className="space-y-1.5 mb-3">
        {hospital.address && (
          <p className="text-xs text-slate-500 flex items-start gap-1.5">
            <svg
              className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            {hospital.address}
          </p>
        )}
        {hospital.phones && (
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <svg
              className="w-3.5 h-3.5 text-slate-400 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
              />
            </svg>
            <a
              href={`tel:${hospital.phones.replace(/\D/g, '')}`}
              className="hover:text-accent-600 transition-colors"
              onClick={() =>
                emit({
                  event_type: 'phone_clicked',
                  state_code: hospital.state_code,
                  payload: { hospital_id: hospital.id },
                })
              }
            >
              {hospital.phones}
            </a>
          </p>
        )}
        {hospital.cnes && <p className="text-xs text-slate-400">CNES: {hospital.cnes}</p>}
      </div>

      {showTreatments && (
        <div className="flex flex-wrap gap-1">
          {hospital.treatments.map((treatment) => (
            <span
              key={treatment}
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                TREATMENT_BADGE_CLASS[treatment] ?? 'bg-slate-100 text-slate-600'
              }`}
            >
              {TREATMENT_LABEL_BY_VALUE[treatment] ?? treatment}
            </span>
          ))}
        </div>
      )}

      {qualificationBadges.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {qualificationBadges.map((label) => (
            <span
              key={label}
              className="text-xs px-2 py-0.5 rounded-full font-medium bg-accent-50 text-accent-700 ring-1 ring-accent-200"
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {mapsUrl && (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs text-accent-600 font-medium hover:text-accent-700 transition-colors"
          onClick={() =>
            emit({
              event_type: 'directions_clicked',
              state_code: hospital.state_code,
              payload: { hospital_id: hospital.id },
            })
          }
        >
          Ver no mapa
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      )}
    </div>
  );
}

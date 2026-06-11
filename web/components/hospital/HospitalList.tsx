'use client';
import dynamic from 'next/dynamic';
import type { Hospital } from '@/lib/types';
import HospitalCard from './HospitalCard';
import WarningIcon from '@/components/WarningIcon';

// Leaflet touches `window` on import — load it only on the client.
const HospitalMap = dynamic(() => import('./HospitalMap'), { ssr: false });

interface HospitalListProps {
  hospitals: Hospital[];
  /** Forwarded to each HospitalCard — see its prop doc. */
  showTreatments?: boolean;
}

export default function HospitalList({ hospitals, showTreatments = true }: HospitalListProps) {
  if (hospitals.length === 0) return null;

  const hasVerificationWarning = hospitals.some((h) => h.requires_verification);
  const isSortedByDistance = hospitals.some((h) => h.distance_km !== undefined);
  const count = hospitals.length;
  const plural = count !== 1;

  return (
    <div className="mt-8">
      {hasVerificationWarning && (
        <div className="mb-4 rounded-2xl border-2 border-red-300 bg-red-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <WarningIcon className="w-6 h-6 shrink-0 text-red-600 mt-0.5" />
            <div className="text-sm text-red-900 space-y-1.5">
              <p className="font-bold uppercase tracking-wide text-red-700 text-xs">
                Atenção — alguns resultados têm dados não verificados
              </p>
              <p className="leading-snug">
                Parte dos hospitais exibidos vem de estados que publicam os dados como{' '}
                <strong>PDF escaneado (imagem)</strong>. Essas unidades foram extraídas
                automaticamente por OCR e <strong>podem conter erros</strong> no nome, endereço ou
                telefone. Elas aparecem marcadas individualmente em{' '}
                <span className="inline-block px-1.5 py-0.5 rounded bg-red-100 ring-1 ring-red-300 font-semibold">
                  vermelho
                </span>
                .
              </p>
              <p className="leading-snug font-semibold">
                Sempre confirme por telefone antes de se deslocar, ou ligue{' '}
                <a href="tel:192" className="underline">
                  192 (SAMU)
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-slate-800">
          {count} {plural ? 'hospitais encontrados' : 'hospital encontrado'}
        </h2>
        {isSortedByDistance && (
          <span className="text-xs text-slate-400">Ordenado por distância</span>
        )}
      </div>

      <div className="mb-5 rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
        <HospitalMap hospitals={hospitals} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {hospitals.map((h) => (
          <HospitalCard key={h.id} hospital={h} showTreatments={showTreatments} />
        ))}
      </div>
    </div>
  );
}

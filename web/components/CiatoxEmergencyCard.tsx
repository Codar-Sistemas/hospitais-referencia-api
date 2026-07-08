'use client';
import { useEffect, useState } from 'react';
import { fetchCiatoxByState } from '@/lib/api-client';
import type { CiatoxStateResponse } from '@/lib/types';
import WarningIcon from '@/components/WarningIcon';

// "Call first" card shown above venomous-vertical search results: in a
// venomous-animal accident the official guidance is to phone the state's
// toxicology center (CIATOX) BEFORE traveling — the center directs the
// patient to the right unit and instructs first aid. Data comes from the
// /v1/ciatox/:uf endpoint (daily sync of the official gov.br page).
//
// The card is an enhancement layered on top of the results: any fetch
// error (or a state with no listed center) renders nothing rather than
// noise in an emergency flow.

// Dialable digits for a tel: link. Keeps the leading "(DD)" area code,
// drops trailing annotations like "(Ramal 5853)" or "(whatsapp)" that
// must not be dialed.
function telHref(phone: string): string {
  const withoutAnnotations = phone.replace(/(?!^)\([^)]*\)/g, '');
  return withoutAnnotations.replace(/\D/g, '');
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
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
  );
}

export default function CiatoxEmergencyCard({ stateCode }: { stateCode: string }) {
  const [data, setData] = useState<CiatoxStateResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCiatoxByState(stateCode)
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch(() => {
        // Enhancement only — never surface an error above emergency results.
      });
    return () => {
      cancelled = true;
    };
  }, [stateCode]);

  // Render only data for the CURRENT state — a stale response from the
  // previous search must never show another state's phone numbers.
  const matches = data?.state_code === stateCode.toUpperCase();
  const primary = matches ? data?.centers[0] : undefined;
  if (!data || !primary) return null;
  const others = data.centers.slice(1);

  return (
    <div className="mt-8 rounded-2xl border-2 border-red-300 bg-red-50 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <WarningIcon className="w-6 h-6 shrink-0 text-red-600 mt-0.5" />
        <div className="flex-1 text-sm text-red-900">
          <p className="font-bold uppercase tracking-wide text-red-700 text-xs">
            Emergência? Ligue primeiro
          </p>
          <p className="mt-1 font-bold text-base">
            CIATOX · {data.state_name}
            <span className="font-medium text-red-800"> — orientação por telefone, 24 horas</span>
          </p>
          <p className="mt-1 leading-snug text-red-800">{primary.name}</p>

          {primary.emergency_phone && (
            <a
              href={`tel:${telHref(primary.emergency_phone)}`}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-white font-bold shadow-sm hover:bg-red-700 transition-colors"
            >
              <PhoneIcon className="w-4 h-4 shrink-0" />
              {primary.emergency_phone}
            </a>
          )}

          {others.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold text-red-700">
                Outros centros no estado ({others.length})
              </summary>
              <ul className="mt-2 space-y-1.5">
                {others.map((center) => (
                  <li key={center.id} className="text-xs leading-snug">
                    <span className="font-medium">{center.name}</span>
                    {center.emergency_phone && (
                      <>
                        {' — '}
                        <a
                          href={`tel:${telHref(center.emergency_phone)}`}
                          className="font-semibold underline underline-offset-2"
                        >
                          {center.emergency_phone}
                        </a>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

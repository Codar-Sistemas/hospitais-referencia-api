'use client';
import { useEffect, useState } from 'react';
import { fetchState } from '@/lib/api-client';
import type { StateSummary } from '@/lib/types';

// Discreet freshness line under the venomous results: since the Ministry
// unpublished the per-state source pages (July 2026), the data shown is the
// last successfully synced snapshot — say so, with the date, instead of
// letting users assume it is live.
export default function SourceFreshnessBadge({ stateCode }: { stateCode: string }) {
  const [state, setState] = useState<StateSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchState(stateCode)
      .then((summary) => {
        if (!cancelled) setState(summary);
      })
      .catch(() => {
        // Badge is informative only — disappear quietly on failure.
      });
    return () => {
      cancelled = true;
    };
  }, [stateCode]);

  // Only render data for the CURRENT state — a stale response from the
  // previous search must not label these results.
  if (!state || state.state_code !== stateCode.toUpperCase() || !state.synced_at) return null;
  const formatted = new Date(state.synced_at).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <p className="mt-3 text-xs text-slate-400">
      Última sincronização com a fonte oficial: {formatted} · fonte oficial em reestruturação pelo
      Ministério da Saúde
    </p>
  );
}

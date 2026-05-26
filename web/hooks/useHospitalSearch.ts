'use client';
import { useCallback, useState, useTransition } from 'react';
import { searchHospitals, searchNearby } from '@/lib/api-client';
import { emit } from '@/lib/telemetry';
import type { Hospital, SearchMode } from '@/lib/types';

export interface HospitalSearchInput {
  mode: SearchMode;
  stateCode?: string;
  city?: string;
  cep?: string;
  treatment?: string;
  radiusM?: number;
  limit?: number;
}

export interface UseHospitalSearchResult {
  hospitals: Hospital[];
  error: string;
  searched: boolean;
  isPending: boolean;
  search: (input: HospitalSearchInput) => void;
  reset: () => void;
}

export function useHospitalSearch(): UseHospitalSearchResult {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [isPending, startTransition] = useTransition();

  const reset = useCallback(() => {
    setHospitals([]);
    setError('');
    setSearched(false);
  }, []);

  const search = useCallback((input: HospitalSearchInput) => {
    setError('');
    setSearched(false);
    startTransition(async () => {
      try {
        let result: Hospital[] = [];
        if (input.mode === 'cep') {
          if (!input.cep || input.cep.replace(/\D/g, '').length !== 8) {
            setError('Informe um CEP válido com 8 dígitos.');
            return;
          }
          const data = await searchNearby({
            cep: input.cep.replace(/\D/g, ''),
            treatment: input.treatment,
            radiusM: input.radiusM ?? 100000,
            limit: input.limit ?? 50,
          });
          result = data.hospitals;
        } else if (input.mode === 'city') {
          if (!input.city) {
            setError('Informe a cidade.');
            return;
          }
          result = await searchHospitals({
            city: input.city,
            stateCode: input.stateCode,
            treatment: input.treatment,
            limit: input.limit ?? 100,
          });
        } else {
          if (!input.stateCode) {
            setError('Selecione um estado.');
            return;
          }
          result = await searchHospitals({
            stateCode: input.stateCode,
            treatment: input.treatment,
            limit: input.limit ?? 200,
          });
        }
        setHospitals(result);
        setSearched(true);
        emit({
          event_type: 'search_executed',
          state_code: input.stateCode || null,
          treatment: input.treatment || null,
          payload: {
            mode: input.mode,
            city: input.city || null,
            has_cep: Boolean(input.cep),
            results_count: result.length,
          },
        });
        if (result.length === 0) {
          setError('Nenhum hospital encontrado com esses filtros.');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao buscar. Tente novamente.';
        setError(message);
      }
    });
  }, []);

  return { hospitals, error, searched, isPending, search, reset };
}

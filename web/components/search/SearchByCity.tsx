'use client';
import { useEffect, useState } from 'react';
import { STATES, TREATMENTS } from '@/lib/constants';
import { fetchCitiesByState } from '@/lib/ibge';
import { FIELD_LABEL_CLASS, INPUT_CLASS } from './SearchTabs';

interface SearchByCityProps {
  city: string;
  stateCode: string;
  treatment: string;
  onCityChange: (value: string) => void;
  onStateCodeChange: (value: string) => void;
  onTreatmentChange: (value: string) => void;
}

export default function SearchByCity({
  city,
  stateCode,
  treatment,
  onCityChange,
  onStateCodeChange,
  onTreatmentChange,
}: SearchByCityProps) {
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch cities from IBGE whenever the state changes.
  // Clears the selected city so a stale value can't survive a state change.
  useEffect(() => {
    if (!stateCode) {
      setCities([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchCitiesByState(stateCode)
      .then((list) => {
        if (cancelled) return;
        setCities(list);
        if (city && !list.includes(city)) onCityChange('');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // We only want to refetch when stateCode changes — onCityChange is stable
    // from the parent hook and city is read inside without dependency tracking.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateCode]);

  const cityPlaceholder = !stateCode
    ? 'Selecione um estado primeiro'
    : loading
      ? 'Carregando cidades...'
      : 'Selecione uma cidade';

  return (
    <div className="col-span-full grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div>
        <label className={FIELD_LABEL_CLASS}>Estado *</label>
        <select
          value={stateCode}
          onChange={(e) => onStateCodeChange(e.target.value)}
          className={INPUT_CLASS}
        >
          <option value="">Selecione o estado</option>
          {STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={FIELD_LABEL_CLASS}>Cidade *</label>
        <select
          value={city}
          onChange={(e) => onCityChange(e.target.value)}
          disabled={!stateCode || loading}
          className={`${INPUT_CLASS} ${!stateCode || loading ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <option value="">{cityPlaceholder}</option>
          {cities.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={FIELD_LABEL_CLASS}>Animal (opcional)</label>
        <select
          value={treatment}
          onChange={(e) => onTreatmentChange(e.target.value)}
          className={INPUT_CLASS}
        >
          <option value="">Todos os tipos</option>
          {TREATMENTS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.emoji} {t.animal}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

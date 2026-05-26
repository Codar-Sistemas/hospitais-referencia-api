'use client';
import { useEffect, useMemo, useState } from 'react';
import Combobox from '@/components/ui/Combobox';
import { STATES, TREATMENTS } from '@/lib/constants';
import { fetchCitiesByState } from '@/lib/ibge';
import { FIELD_LABEL_CLASS } from './SearchTabs';

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

  const stateOptions = useMemo(
    () => STATES.map((s) => ({ value: s.code, label: s.name, keywords: s.code })),
    [],
  );

  const treatmentOptions = useMemo(
    () =>
      TREATMENTS.map((t) => ({
        value: t.value,
        label: `${t.emoji} ${t.animal}`,
        keywords: `${t.label} ${t.value}`,
      })),
    [],
  );

  const cityOptions = useMemo(
    () => cities.map((name) => ({ value: name, label: name })),
    [cities],
  );

  // Fetch IBGE city list whenever the state changes. Clears the selected
  // city if it doesn't exist in the new state's list.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateCode]);

  const cityDisabled = !stateCode || loading;
  const cityPlaceholder = !stateCode
    ? 'Selecione um estado primeiro'
    : loading
      ? 'Carregando cidades...'
      : 'Selecione uma cidade';

  return (
    <div className="col-span-full grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div>
        <label className={FIELD_LABEL_CLASS}>Estado *</label>
        <Combobox
          value={stateCode}
          onChange={onStateCodeChange}
          options={stateOptions}
          placeholder="Selecione o estado"
        />
      </div>
      <div>
        <label className={FIELD_LABEL_CLASS}>Cidade *</label>
        <Combobox
          value={city}
          onChange={onCityChange}
          options={cityOptions}
          placeholder="Selecione uma cidade"
          disabledPlaceholder={cityPlaceholder}
          disabled={cityDisabled}
        />
      </div>
      <div>
        <label className={FIELD_LABEL_CLASS}>Animal (opcional)</label>
        <Combobox
          value={treatment}
          onChange={onTreatmentChange}
          options={treatmentOptions}
          placeholder="Todos os tipos"
        />
      </div>
    </div>
  );
}

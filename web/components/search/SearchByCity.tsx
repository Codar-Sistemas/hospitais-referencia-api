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
  /** Hide the treatment combobox for verticals without a treatment
   * vocabulary (e.g. rare-diseases). Defaults to shown. */
  showTreatmentFilter?: boolean;
  /** Disease-area filter for qualification-based verticals — renders a
   * "Doença (opcional)" combobox when non-empty. */
  diseaseOptions?: ReadonlyArray<{ value: string; label: string }>;
  disease?: string;
  onDiseaseChange?: (value: string) => void;
}

export default function SearchByCity({
  city,
  stateCode,
  treatment,
  onCityChange,
  onStateCodeChange,
  onTreatmentChange,
  showTreatmentFilter = true,
  diseaseOptions = [],
  disease = '',
  onDiseaseChange,
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

  const cityOptions = useMemo(() => cities.map((name) => ({ value: name, label: name })), [cities]);

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

  const showDiseaseFilter = diseaseOptions.length > 0;
  const filterColumns = 2 + (showTreatmentFilter ? 1 : 0) + (showDiseaseFilter ? 1 : 0);

  return (
    <div
      className={`col-span-full grid grid-cols-1 gap-4 ${
        filterColumns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
      }`}
    >
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
      {showTreatmentFilter && (
        <div>
          <label className={FIELD_LABEL_CLASS}>Animal (opcional)</label>
          <Combobox
            value={treatment}
            onChange={onTreatmentChange}
            options={treatmentOptions}
            placeholder="Todos os tipos"
          />
        </div>
      )}
      {showDiseaseFilter && onDiseaseChange && (
        <div>
          <label className={FIELD_LABEL_CLASS}>Doença (opcional)</label>
          <Combobox
            value={disease}
            onChange={onDiseaseChange}
            options={[...diseaseOptions]}
            placeholder="Todas as áreas"
          />
        </div>
      )}
    </div>
  );
}

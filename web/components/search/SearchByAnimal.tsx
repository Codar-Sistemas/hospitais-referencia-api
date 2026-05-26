'use client';
import { useMemo } from 'react';
import Combobox from '@/components/ui/Combobox';
import { STATES, TREATMENTS } from '@/lib/constants';
import { FIELD_LABEL_CLASS } from './SearchTabs';

interface SearchByAnimalProps {
  stateCode: string;
  treatment: string;
  onStateCodeChange: (value: string) => void;
  onTreatmentChange: (value: string) => void;
}

export default function SearchByAnimal({
  stateCode,
  treatment,
  onStateCodeChange,
  onTreatmentChange,
}: SearchByAnimalProps) {
  // keywords includes the UF code so typing "SP" finds "São Paulo".
  const stateOptions = useMemo(
    () => STATES.map((s) => ({ value: s.code, label: s.name, keywords: s.code })),
    [],
  );

  // Animal name is what users actually type; keep canonical EN value for the API.
  const treatmentOptions = useMemo(
    () =>
      TREATMENTS.map((t) => ({
        value: t.value,
        label: `${t.emoji} ${t.animal}`,
        keywords: `${t.label} ${t.value}`,
      })),
    [],
  );

  return (
    <>
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
        <label className={FIELD_LABEL_CLASS}>Animal (opcional)</label>
        <Combobox
          value={treatment}
          onChange={onTreatmentChange}
          options={treatmentOptions}
          placeholder="Todos os tipos"
        />
      </div>
    </>
  );
}

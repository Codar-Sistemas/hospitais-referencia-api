'use client';
import { useMemo } from 'react';
import Combobox from '@/components/ui/Combobox';
import { TREATMENTS } from '@/lib/constants';
import { FIELD_LABEL_CLASS, INPUT_CLASS } from './SearchTabs';

interface SearchByPostalCodeProps {
  cep: string;
  treatment: string;
  onCepChange: (value: string) => void;
  onTreatmentChange: (value: string) => void;
  /** Hide the treatment combobox for verticals without a treatment
   * vocabulary (e.g. rare-diseases). Defaults to shown. */
  showTreatmentFilter?: boolean;
}

export default function SearchByPostalCode({
  cep,
  treatment,
  onCepChange,
  onTreatmentChange,
  showTreatmentFilter = true,
}: SearchByPostalCodeProps) {
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
        <label className={FIELD_LABEL_CLASS}>CEP *</label>
        <input
          value={cep}
          onChange={(e) => onCepChange(e.target.value)}
          placeholder="00000-000"
          maxLength={9}
          className={INPUT_CLASS}
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
    </>
  );
}

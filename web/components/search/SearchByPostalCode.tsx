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
  /** Disease-area filter for qualification-based verticals — renders a
   * "Doença (opcional)" combobox when non-empty. */
  diseaseOptions?: ReadonlyArray<{ value: string; label: string }>;
  disease?: string;
  onDiseaseChange?: (value: string) => void;
  /** PT label for the disease filter (per-vertical, e.g. "Tipo de serviço"). */
  diseaseFilterLabel?: string;
}

export default function SearchByPostalCode({
  cep,
  treatment,
  onCepChange,
  onTreatmentChange,
  showTreatmentFilter = true,
  diseaseOptions = [],
  disease = '',
  onDiseaseChange,
  diseaseFilterLabel = 'Doença',
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
      {diseaseOptions.length > 0 && onDiseaseChange && (
        <div>
          <label className={FIELD_LABEL_CLASS}>{diseaseFilterLabel} (opcional)</label>
          <Combobox
            value={disease}
            onChange={onDiseaseChange}
            options={[...diseaseOptions]}
            placeholder="Todas as áreas"
          />
        </div>
      )}
    </>
  );
}

'use client';
import { TREATMENTS } from '@/lib/constants';
import { FIELD_LABEL_CLASS, INPUT_CLASS } from './SearchTabs';

interface SearchByPostalCodeProps {
  cep: string;
  treatment: string;
  onCepChange: (value: string) => void;
  onTreatmentChange: (value: string) => void;
}

export default function SearchByPostalCode({
  cep,
  treatment,
  onCepChange,
  onTreatmentChange,
}: SearchByPostalCodeProps) {
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
      <div>
        <label className={FIELD_LABEL_CLASS}>Animal (opcional)</label>
        <select value={treatment} onChange={(e) => onTreatmentChange(e.target.value)} className={INPUT_CLASS}>
          <option value="">Todos os tipos</option>
          {TREATMENTS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.emoji} {t.animal}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

'use client';
import { STATES, TREATMENTS } from '@/lib/constants';
import { FIELD_LABEL_CLASS, INPUT_CLASS } from './SearchTabs';

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
  return (
    <>
      <div>
        <label className={FIELD_LABEL_CLASS}>Estado *</label>
        <select value={stateCode} onChange={(e) => onStateCodeChange(e.target.value)} className={INPUT_CLASS}>
          <option value="">Selecione o estado</option>
          {STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
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

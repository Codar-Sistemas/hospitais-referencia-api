'use client';
import { STATES, TREATMENTS } from '@/lib/constants';
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
  return (
    <div className="col-span-full grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div>
        <label className={FIELD_LABEL_CLASS}>Cidade *</label>
        <input
          value={city}
          onChange={(e) => onCityChange(e.target.value)}
          placeholder="Ex: Campinas"
          className={INPUT_CLASS}
        />
      </div>
      <div>
        <label className={FIELD_LABEL_CLASS}>Estado (opcional)</label>
        <select value={stateCode} onChange={(e) => onStateCodeChange(e.target.value)} className={INPUT_CLASS}>
          <option value="">Todos os estados</option>
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
    </div>
  );
}

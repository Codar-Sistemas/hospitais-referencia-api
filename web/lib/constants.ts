// Brazilian states. `code` is the canonical UF abbreviation sent to the API;
// `name` is the human-readable Portuguese label shown in the UI.
export const STATES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'AC', name: 'Acre' },
  { code: 'AL', name: 'Alagoas' },
  { code: 'AM', name: 'Amazonas' },
  { code: 'AP', name: 'Amapá' },
  { code: 'BA', name: 'Bahia' },
  { code: 'CE', name: 'Ceará' },
  { code: 'DF', name: 'Distrito Federal' },
  { code: 'ES', name: 'Espírito Santo' },
  { code: 'GO', name: 'Goiás' },
  { code: 'MA', name: 'Maranhão' },
  { code: 'MG', name: 'Minas Gerais' },
  { code: 'MS', name: 'Mato Grosso do Sul' },
  { code: 'MT', name: 'Mato Grosso' },
  { code: 'PA', name: 'Pará' },
  { code: 'PB', name: 'Paraíba' },
  { code: 'PE', name: 'Pernambuco' },
  { code: 'PI', name: 'Piauí' },
  { code: 'PR', name: 'Paraná' },
  { code: 'RJ', name: 'Rio de Janeiro' },
  { code: 'RN', name: 'Rio Grande do Norte' },
  { code: 'RO', name: 'Rondônia' },
  { code: 'RR', name: 'Roraima' },
  { code: 'RS', name: 'Rio Grande do Sul' },
  { code: 'SC', name: 'Santa Catarina' },
  { code: 'SE', name: 'Sergipe' },
  { code: 'SP', name: 'São Paulo' },
  { code: 'TO', name: 'Tocantins' },
];

// Treatment types: `value` is the canonical English string the API stores and
// returns; `label` and `animal` are Portuguese labels displayed to users.
export interface TreatmentOption {
  value: string;
  label: string;
  animal: string;
  emoji: string;
}

export const TREATMENTS: ReadonlyArray<TreatmentOption> = [
  { value: 'Bothropic',      label: 'Botrópico',      animal: 'Cobra / Jararaca',  emoji: '🐍' },
  { value: 'Crotalic',       label: 'Crotálico',      animal: 'Cascavel',          emoji: '🐍' },
  { value: 'Elapidic',       label: 'Elapídico',      animal: 'Cobra-coral',       emoji: '🐍' },
  { value: 'Lachetic',       label: 'Laquético',      animal: 'Surucucu',          emoji: '🐍' },
  { value: 'Scorpionic',     label: 'Escorpiônico',   animal: 'Escorpião',         emoji: '🦂' },
  { value: 'Loxoscelic',     label: 'Loxoscélico',    animal: 'Aranha-marrom',     emoji: '🕷️' },
  { value: 'Phoneutric',     label: 'Foneutrico',     animal: 'Aranha-armadeira',  emoji: '🕷️' },
  { value: 'Lonomic',        label: 'Lonômico',       animal: 'Lagarta (Lonomia)', emoji: '🐛' },
  { value: 'Antiarachnidic', label: 'Antiaracnídico', animal: 'Aranhas (genérico)', emoji: '🕷️' },
];

// PT label for each canonical EN treatment value — for rendering API responses.
export const TREATMENT_LABEL_BY_VALUE: Record<string, string> = Object.fromEntries(
  TREATMENTS.map((t) => [t.value, t.label]),
);

// Tailwind color classes for treatment badges, keyed by canonical EN value.
export const TREATMENT_BADGE_CLASS: Record<string, string> = {
  Bothropic:      'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  Crotalic:       'bg-red-50 text-red-700 ring-1 ring-red-200',
  Elapidic:       'bg-pink-50 text-pink-700 ring-1 ring-pink-200',
  Lachetic:       'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
  Scorpionic:     'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  Loxoscelic:     'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200',
  Phoneutric:     'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  Lonomic:        'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  Antiarachnidic: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
};

// Foreground-only color classes for compact tables (no background).
export const TREATMENT_TEXT_CLASS: Record<string, string> = {
  Bothropic:      'text-orange-600',
  Crotalic:       'text-red-600',
  Elapidic:       'text-pink-600',
  Lachetic:       'text-purple-600',
  Scorpionic:     'text-amber-600',
  Loxoscelic:     'text-yellow-600',
  Phoneutric:     'text-blue-600',
  Lonomic:        'text-emerald-600',
  Antiarachnidic: 'text-slate-600',
};

// Canonical English treatment names — what the DB stores and the API returns.
const CANONICAL_TREATMENTS = [
  'Bothropic',
  'Crotalic',
  'Elapidic',
  'Lachetic',
  'Scorpionic',
  'Loxoscelic',
  'Phoneutric',
  'Lonomic',
  'Antiarachnidic',
];

// Accepted input aliases (lowercase, accent-stripped key → canonical EN value).
// Includes EN canonicals, PT cognates, and common animal names for end-user friendliness.
const TREATMENT_ALIASES = {
  bothropic: 'Bothropic',
  crotalic: 'Crotalic',
  elapidic: 'Elapidic',
  lachetic: 'Lachetic',
  scorpionic: 'Scorpionic',
  loxoscelic: 'Loxoscelic',
  phoneutric: 'Phoneutric',
  lonomic: 'Lonomic',
  antiarachnidic: 'Antiarachnidic',
  botropico: 'Bothropic',
  crotalico: 'Crotalic',
  elapidico: 'Elapidic',
  laquetico: 'Lachetic',
  escorpionico: 'Scorpionic',
  loxoscelico: 'Loxoscelic',
  foneutrico: 'Phoneutric',
  lonomico: 'Lonomic',
  antiaracnidico: 'Antiarachnidic',
  bothrops: 'Bothropic',
  jararaca: 'Bothropic',
  cobra: 'Bothropic',
  cascavel: 'Crotalic',
  crotalus: 'Crotalic',
  coral: 'Elapidic',
  micrurus: 'Elapidic',
  surucucu: 'Lachetic',
  lachesis: 'Lachetic',
  escorpiao: 'Scorpionic',
  escorpion: 'Scorpionic',
  scorpion: 'Scorpionic',
  tityus: 'Scorpionic',
  aranha: 'Loxoscelic',
  'aranha marrom': 'Loxoscelic',
  spider: 'Loxoscelic',
  loxosceles: 'Loxoscelic',
  armadeira: 'Phoneutric',
  'aranha armadeira': 'Phoneutric',
  phoneutria: 'Phoneutric',
  lagarta: 'Lonomic',
  caterpillar: 'Lonomic',
  lonomia: 'Lonomic',
};

function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalizeKey(s) {
  return stripAccents(String(s)).toLowerCase().trim();
}

function normalizeTreatment(input) {
  if (!input) return null;
  return TREATMENT_ALIASES[normalizeKey(input)] || null;
}

function normalizeCity(input) {
  if (!input) return null;
  return stripAccents(String(input)).toLowerCase();
}

module.exports = {
  CANONICAL_TREATMENTS,
  TREATMENT_ALIASES,
  stripAccents,
  normalizeKey,
  normalizeTreatment,
  normalizeCity,
};

// Brazilian macro-regions and resident population per state (IBGE,
// Censo Demográfico 2022). Static public data — embedded so the stats
// page can compute per-capita coverage without an extra network call.
// Revisit when IBGE publishes the next census (2030).

export const REGIONS = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'] as const;
export type Region = (typeof REGIONS)[number];

export const REGION_BY_STATE: Readonly<Record<string, Region>> = {
  AC: 'Norte',
  AM: 'Norte',
  AP: 'Norte',
  PA: 'Norte',
  RO: 'Norte',
  RR: 'Norte',
  TO: 'Norte',
  AL: 'Nordeste',
  BA: 'Nordeste',
  CE: 'Nordeste',
  MA: 'Nordeste',
  PB: 'Nordeste',
  PE: 'Nordeste',
  PI: 'Nordeste',
  RN: 'Nordeste',
  SE: 'Nordeste',
  DF: 'Centro-Oeste',
  GO: 'Centro-Oeste',
  MS: 'Centro-Oeste',
  MT: 'Centro-Oeste',
  ES: 'Sudeste',
  MG: 'Sudeste',
  RJ: 'Sudeste',
  SP: 'Sudeste',
  PR: 'Sul',
  RS: 'Sul',
  SC: 'Sul',
};

// Resident population, Censo 2022 (IBGE).
export const POPULATION_BY_STATE: Readonly<Record<string, number>> = {
  AC: 830_018,
  AL: 3_127_683,
  AM: 3_941_613,
  AP: 733_759,
  BA: 14_141_626,
  CE: 8_794_957,
  DF: 2_817_381,
  ES: 3_833_712,
  GO: 7_056_495,
  MA: 6_776_699,
  MG: 20_539_989,
  MS: 2_757_013,
  MT: 3_658_649,
  PA: 8_116_132,
  PB: 3_974_687,
  PE: 9_058_931,
  PI: 3_271_199,
  PR: 11_444_380,
  RJ: 16_055_174,
  RN: 3_302_729,
  RO: 1_581_016,
  RR: 636_707,
  RS: 10_882_965,
  SC: 7_610_361,
  SE: 2_210_004,
  SP: 44_411_238,
  TO: 1_511_460,
};

export const POPULATION_BY_REGION: Readonly<Record<Region, number>> = (() => {
  const totals = { Norte: 0, Nordeste: 0, 'Centro-Oeste': 0, Sudeste: 0, Sul: 0 };
  for (const [uf, region] of Object.entries(REGION_BY_STATE)) {
    totals[region] += POPULATION_BY_STATE[uf] ?? 0;
  }
  return totals;
})();

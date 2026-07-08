// CIATOX toxicology centers — the "call first" companion dataset of the
// venomous-animals vertical. Directory rows only (its own table, not
// `hospitals`), so this service is deliberately independent of the
// hospital vertical machinery.

import { NotFoundError } from '../core/errors.js';
import * as ciatoxRepo from '../repositories/ciatox-repo.js';
import * as stateRepo from '../repositories/state-repo.js';
import type { CiatoxCenter } from '../types/domain.js';

export interface CiatoxListResult {
  total_returned: number;
  centers: CiatoxCenter[];
}

export interface CiatoxByStateResult extends CiatoxListResult {
  state_code: string;
  /** Portuguese state name — lets clients render "CIATOX do Piauí"
   * without shipping their own UF table. */
  state_name: string;
}

export async function listCenters(): Promise<CiatoxListResult> {
  const centers = await ciatoxRepo.listAll();
  return { total_returned: centers.length, centers };
}

export async function getCentersByState(stateCode: string): Promise<CiatoxByStateResult> {
  const code = String(stateCode || '').toUpperCase();
  const state = await stateRepo.findByCode(code);
  if (!state) throw new NotFoundError(`State '${code}' not found`);
  // An existing UF with no center listed returns an honest empty list —
  // the source page currently covers 20 of the 27 states.
  const centers = await ciatoxRepo.findByState(code);
  return {
    state_code: code,
    state_name: state.name,
    total_returned: centers.length,
    centers,
  };
}

// Read-only. Writes are owned by scripts/syncs/ciatox/.

import { sb } from '../core/supabase.js';
import type { CiatoxCenter } from '../types/domain.js';

const LIST_COLUMNS = 'id,state_code,name,emergency_phone,phones,source_url,synced_at';

export async function listAll(): Promise<CiatoxCenter[]> {
  return sb<CiatoxCenter>('ciatox_centers', {
    select: LIST_COLUMNS,
    order: 'state_code.asc,id.asc',
  });
}

export async function findByState(stateCode: string): Promise<CiatoxCenter[]> {
  return sb<CiatoxCenter>('ciatox_centers', {
    select: LIST_COLUMNS,
    state_code: `eq.${stateCode}`,
    order: 'id.asc',
  });
}

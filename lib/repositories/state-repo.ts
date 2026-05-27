/**
 * State repository — read-only access to the `states` table. Writes are
 * owned by the sync pipeline (scripts/syncs/animais_peconhentos/).
 */

import { sb } from '../core/supabase.js';
import type { StateSummary } from '../types/domain.js';

const LIST_COLUMNS = 'state_code,name,updated_at,synced_at,total_hospitals,status';

export async function listStates(): Promise<StateSummary[]> {
  return sb<StateSummary>('states', {
    select: LIST_COLUMNS,
    order: 'state_code.asc',
  });
}

/**
 * Accepts any string — the database constraint enforces the 2-letter
 * shape. Service layer is responsible for upper-casing.
 */
export async function findByCode(stateCode: string): Promise<StateSummary | null> {
  const rows = await sb<StateSummary>('states', {
    select: '*',
    state_code: `eq.${stateCode}`,
  });
  return rows[0] ?? null;
}

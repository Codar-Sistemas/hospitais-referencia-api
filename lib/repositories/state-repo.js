const { sb } = require('../core/supabase');

const LIST_COLUMNS = 'state_code,name,updated_at,synced_at,total_hospitals,status';

async function listStates() {
  return sb('states', {
    select: LIST_COLUMNS,
    order: 'state_code.asc',
  });
}

async function findByCode(stateCode) {
  const rows = await sb('states', {
    select: '*',
    state_code: `eq.${stateCode}`,
  });
  return rows[0] || null;
}

module.exports = { listStates, findByCode };

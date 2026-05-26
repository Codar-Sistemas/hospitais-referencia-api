// Backwards-compat aliases (PT → EN). Emit Deprecation/Sunset headers when used.
const DEPRECATION_DAYS = 90;

const PARAM_ALIASES = {
  state_code: ['uf'],
  city: ['municipio', 'cidade'],
  treatment: ['atendimento'],
  radius_m: ['raio'],
};

function sunsetDate(now = new Date()) {
  const d = new Date(now.getTime() + DEPRECATION_DAYS * 24 * 60 * 60 * 1000);
  return d.toUTCString();
}

function getParam(searchParams, canonical) {
  const direct = searchParams.get(canonical);
  if (direct !== null && direct !== '') return { value: direct, deprecated: false };
  const aliases = PARAM_ALIASES[canonical] || [];
  for (const alias of aliases) {
    const v = searchParams.get(alias);
    if (v !== null && v !== '') return { value: v, deprecated: true };
  }
  return { value: null, deprecated: false };
}

// Reads canonical params and applies deprecation headers if any alias was used.
function readParams(searchParams, canonicals, res) {
  const out = {};
  let anyDeprecated = false;
  for (const name of canonicals) {
    const { value, deprecated } = getParam(searchParams, name);
    out[name] = value;
    if (deprecated) anyDeprecated = true;
  }
  if (anyDeprecated && res) {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', sunsetDate());
  }
  return out;
}

function parseIntParam(value, { fallback, max, min = 0 } = {}) {
  const n = parseInt(value ?? '', 10);
  if (isNaN(n)) return fallback;
  let result = Math.max(n, min);
  if (typeof max === 'number') result = Math.min(result, max);
  return result;
}

function parseFloatParam(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = parseFloat(value);
  return isNaN(n) ? null : n;
}

module.exports = { readParams, parseIntParam, parseFloatParam, sunsetDate };

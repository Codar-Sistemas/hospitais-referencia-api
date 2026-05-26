// IBGE Localidades API — official Brazilian government source of city data.
// Free, public, no API key needed, generous CORS.
// We cache per state in module scope (cities don't change across navigations).

const IBGE_BASE = 'https://servicodados.ibge.gov.br/api/v1/localidades';

const cityCache = new Map<string, string[]>();
const inflight = new Map<string, Promise<string[]>>();

interface IbgeMunicipio {
  id: number;
  nome: string;
}

/**
 * Returns alphabetically-sorted city names for the given state code (UF).
 * Empty array on network failure (so the UI degrades gracefully).
 */
export async function fetchCitiesByState(stateCode: string): Promise<string[]> {
  const code = stateCode.toUpperCase();
  if (!code) return [];

  const cached = cityCache.get(code);
  if (cached) return cached;

  const pending = inflight.get(code);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const response = await fetch(`${IBGE_BASE}/estados/${code}/municipios?orderBy=nome`);
      if (!response.ok) return [];
      const data = (await response.json()) as IbgeMunicipio[];
      const names = data.map((m) => m.nome);
      cityCache.set(code, names);
      return names;
    } catch {
      return [];
    } finally {
      inflight.delete(code);
    }
  })();

  inflight.set(code, promise);
  return promise;
}

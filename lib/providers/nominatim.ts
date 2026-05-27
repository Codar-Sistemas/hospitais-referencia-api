/**
 * Nominatim (OpenStreetMap) geocoding provider.
 *
 * Used as a fallback when BrasilAPI returns a CEP without coordinates
 * (which, in practice, is the vast majority of CEPs).
 *
 * Public Nominatim policy: max 1 req/s and a descriptive User-Agent. We
 * don't sleep here — at API request rate this is well under the cap, and
 * we cache results in Supabase so a repeated CEP costs nothing.
 *
 * Docs: https://nominatim.org/release-docs/develop/api/Search/
 */

const DEFAULT_TIMEOUT_MS = 8000;
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const DEFAULT_USER_AGENT =
  'hospitais-referencia-api/1.0 (+https://github.com/Codar-Sistemas/hospitais-referencia-api)';

export interface NominatimGeocodeResult {
  lat: number;
  lng: number;
}

export interface GeocodingProvider {
  readonly name: string;
  geocode(query: string): Promise<NominatimGeocodeResult | null>;
}

interface NominatimOptions {
  userAgent?: string;
  timeoutMs?: number;
}

interface NominatimResponseItem {
  lat?: string | number | null;
  lon?: string | number | null;
}

export class NominatimProvider implements GeocodingProvider {
  readonly name = 'nominatim';
  private readonly userAgent: string;
  private readonly timeoutMs: number;

  constructor({ userAgent, timeoutMs = DEFAULT_TIMEOUT_MS }: NominatimOptions = {}) {
    this.userAgent = userAgent ?? DEFAULT_USER_AGENT;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Geocodes a free-text Brazilian address. Returns `{ lat, lng }` or
   * `null` on any failure. The caller is responsible for caching.
   */
  async geocode(query: string): Promise<NominatimGeocodeResult | null> {
    if (!query?.trim()) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const url = new URL(NOMINATIM_URL);
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', '1');
      url.searchParams.set('countrycodes', 'br');
      url.searchParams.set('addressdetails', '0');

      const r = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
        signal: controller.signal,
      });
      if (!r.ok) return null;
      const data = (await r.json()) as NominatimResponseItem[];
      if (!Array.isArray(data) || data.length === 0) return null;
      const first = data[0];
      if (!first || first.lat == null || first.lon == null) return null;
      const lat = Number(first.lat);
      const lng = Number(first.lon);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
      return { lat, lng };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

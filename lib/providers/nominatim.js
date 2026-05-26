/**
 * Nominatim (OpenStreetMap) geocoding provider.
 *
 * Used as a fallback when BrasilAPI returns a CEP without coordinates
 * (which, in practice, is the vast majority of CEPs).
 *
 * Public Nominatim policy: max 1 req/s and a descriptive User-Agent.
 * We don't sleep here — at API request rate this is well under the cap,
 * and we cache results in Supabase so a repeated CEP costs nothing.
 *
 * Docs: https://nominatim.org/release-docs/develop/api/Search/
 */

const DEFAULT_TIMEOUT_MS = 8000;
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

class NominatimProvider {
  constructor({ userAgent, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this._userAgent =
      userAgent ||
      'hospitais-referencia-api/1.0 (+https://github.com/Codar-Sistemas/hospitais-referencia-api)';
    this._timeoutMs = timeoutMs;
  }

  get name() {
    return 'nominatim';
  }

  /**
   * Geocode a free-text Brazilian address. Returns { lat, lng } or null.
   * Caller is responsible for caching.
   */
  async geocode(query) {
    if (!query || !query.trim()) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);

    try {
      const url = new URL(NOMINATIM_URL);
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', '1');
      url.searchParams.set('countrycodes', 'br');
      url.searchParams.set('addressdetails', '0');

      const r = await fetch(url, {
        headers: {
          'User-Agent': this._userAgent,
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
        signal: controller.signal,
      });
      if (!r.ok) return null;
      const data = await r.json();
      if (!Array.isArray(data) || data.length === 0) return null;
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      if (isNaN(lat) || isNaN(lng)) return null;
      return { lat, lng };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { NominatimProvider };

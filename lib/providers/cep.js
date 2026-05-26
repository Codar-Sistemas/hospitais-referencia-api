/**
 * CEP lookup providers — abstraction over external vendors.
 *
 * To swap providers, pass a different CepProvider instance to the service
 * (see api/services/geocoding-service.js). Each provider implements:
 *   - get name(): string                — identifier (e.g. 'brasilapi')
 *   - async lookup(cep): CepResult|null — returns data or null
 *
 * CepResult = { cep, street, neighborhood, city, state_code, lat, lng }
 */

const DEFAULT_TIMEOUT_MS = 8000;

/**
 * BrasilAPI v2 — combines multiple CEP sources (Correios + ViaCEP + ...)
 * and returns coordinates when available. Free, no key, generous rate limit.
 * https://brasilapi.com.br/docs#tag/CEP-V2
 */
class BrasilApiCepProvider {
  constructor({ userAgent, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this._userAgent =
      userAgent ||
      'hospitais-referencia-api/1.0 (+https://github.com/Codar-Sistemas/hospitais-referencia-api)';
    this._timeoutMs = timeoutMs;
  }

  get name() {
    return 'brasilapi';
  }

  async lookup(cep) {
    const cleanCep = (cep || '').replace(/\D/g, '');
    if (cleanCep.length !== 8) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);

    try {
      const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${cleanCep}`, {
        headers: { 'User-Agent': this._userAgent },
        signal: controller.signal,
      });
      if (!r.ok) return null;
      const data = await r.json();
      const coords = (data.location && data.location.coordinates) || {};
      return {
        cep: cleanCep,
        city: data.city || null,
        state_code: data.state || null,
        neighborhood: data.neighborhood || null,
        street: data.street || null,
        lat: coords.latitude ? parseFloat(coords.latitude) : null,
        lng: coords.longitude ? parseFloat(coords.longitude) : null,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { BrasilApiCepProvider };

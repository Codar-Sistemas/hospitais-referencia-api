/**
 * Providers de consulta de CEP — abstração sobre fornecedores externos.
 *
 * Para trocar de provider, passe uma instância diferente de CepProvider
 * no handler (ver api/index.js). Cada provider implementa:
 *   - get name(): string            — identificador (ex: 'brasilapi')
 *   - async lookup(cep): CepResult  — retorna dados ou null
 *
 * CepResult = {
 *   cep, logradouro, bairro, cidade, uf, lat, lng
 * }
 */

const DEFAULT_TIMEOUT_MS = 8000;

/**
 * BrasilAPI v2 — combina múltiplas fontes de CEP (Correios + ViaCEP + etc)
 * e retorna coordenadas quando disponíveis.
 *
 * Grátis, sem chave, rate limit generoso.
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
    const cepLimpo = (cep || '').replace(/\D/g, '');
    if (cepLimpo.length !== 8) return null;

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this._timeoutMs);

    try {
      const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${cepLimpo}`, {
        headers: { 'User-Agent': this._userAgent },
        signal: controller.signal,
      });
      if (!r.ok) return null;
      const data = await r.json();
      const coords = (data.location && data.location.coordinates) || {};
      return {
        cep: cepLimpo,
        cidade: data.city || null,
        uf: data.state || null,
        bairro: data.neighborhood || null,
        logradouro: data.street || null,
        lat: coords.latitude ? parseFloat(coords.latitude) : null,
        lng: coords.longitude ? parseFloat(coords.longitude) : null,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  }
}

module.exports = { BrasilApiCepProvider };

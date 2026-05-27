import type { StateCode } from '../types/domain.js';

export interface CepLookupResult {
  cep: string;
  city: string | null;
  state_code: StateCode | null;
  neighborhood: string | null;
  street: string | null;
  lat: number | null;
  lng: number | null;
}

export interface CepProvider {
  readonly name: string;
  lookup(cep: string): Promise<CepLookupResult | null>;
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_USER_AGENT =
  'hospitais-referencia-api/1.0 (+https://github.com/Codar-Sistemas/hospitais-referencia-api)';

interface BrasilApiOptions {
  userAgent?: string;
  timeoutMs?: number;
}

interface BrasilApiResponse {
  city?: string | null;
  state?: string | null;
  neighborhood?: string | null;
  street?: string | null;
  location?: {
    coordinates?: {
      latitude?: string | number | null;
      longitude?: string | number | null;
    };
  };
}

// https://brasilapi.com.br/docs#tag/CEP-V2 — free, no key, aggregates
// Correios + ViaCEP + others. Returns coords only for a minority of CEPs.
export class BrasilApiCepProvider implements CepProvider {
  readonly name = 'brasilapi';
  private readonly userAgent: string;
  private readonly timeoutMs: number;

  constructor({ userAgent, timeoutMs = DEFAULT_TIMEOUT_MS }: BrasilApiOptions = {}) {
    this.userAgent = userAgent ?? DEFAULT_USER_AGENT;
    this.timeoutMs = timeoutMs;
  }

  async lookup(cep: string): Promise<CepLookupResult | null> {
    const cleanCep = (cep || '').replace(/\D/g, '');
    if (cleanCep.length !== 8) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${cleanCep}`, {
        headers: { 'User-Agent': this.userAgent },
        signal: controller.signal,
      });
      if (!r.ok) return null;
      const data = (await r.json()) as BrasilApiResponse;
      const coords = data.location?.coordinates ?? {};
      const lat = coords.latitude == null ? null : Number(coords.latitude);
      const lng = coords.longitude == null ? null : Number(coords.longitude);
      return {
        cep: cleanCep,
        city: data.city ?? null,
        state_code: (data.state as StateCode | undefined) ?? null,
        neighborhood: data.neighborhood ?? null,
        street: data.street ?? null,
        lat: lat !== null && !Number.isNaN(lat) ? lat : null,
        lng: lng !== null && !Number.isNaN(lng) ? lng : null,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

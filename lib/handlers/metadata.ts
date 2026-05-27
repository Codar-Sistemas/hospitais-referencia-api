import { json } from '../core/http.js';
import type { Request, Response } from '../types/http.js';

const METADATA = {
  name: 'hospitais-referencia-api',
  version: '1.1',
  source: 'Ministério da Saúde - gov.br/saude',
  docs: 'https://hospitais-referencia-web.vercel.app/docs',
  repository: 'https://github.com/Codar-Sistemas/hospitais-referencia-api',
  usage_notice: [
    'This is a public, free, volunteer-maintained API.',
    'Use responsibly: query volume should reflect real user activity.',
    'Do not loop requests or run automated crawls.',
    'For high volume, cache responses in your application.',
    'Free dependencies: Supabase, Vercel, BrasilAPI, Nominatim/OpenStreetMap.',
  ],
  endpoints: [
    'GET /v1/states',
    'GET /v1/states/:state_code',
    'GET /v1/hospitals?state_code=SP&treatment=crotalic',
    'GET /v1/hospitals/:id',
    'GET /v1/hospitals/nearby?cep=13280000&radius_m=50000',
    'GET /v1/hospitals/nearby?lat=-23.5&lng=-46.6&treatment=elapidic',
    'GET /v1/hospitals/nearby?city=Campinas&state_code=SP',
    'GET /v1/search?q=curitiba',
  ],
} as const;

export function getMetadata(_req: Request, res: Response): void {
  json(res, 200, METADATA);
}
